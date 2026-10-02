#!/usr/bin/python3
"""Bounded HTTPS fetch for the fixed IceStream lookups.

The panel names an operation. This process builds the URL, refuses a
non-global address, does not follow redirects, and stops when the body
or the deadline exceeds a fixed cap. Stdout is the body only on success.
"""

import ipaddress
import os
import re
import select
import signal
import socket
import subprocess
import sys
import time

UA = "IceStream (https://github.com/JohnicBoom/IceStream)"
CURL = "/usr/bin/curl"

CAPS = {
    "icecast": 512 * 1024,
    "ccl": 2 * 1024 * 1024,
    "zip": 256 * 1024,
    "points": 256 * 1024,
    "radio": 256 * 1024,
    "wttr": 256 * 1024,
}
DEADLINES = {"icecast": 12, "ccl": 20}
CALL = re.compile(r"^[A-Z][A-Z0-9]{4,5}$")
ZIP = re.compile(r"^[0-9]{5}$")
FOUR = re.compile(r"^-?\d{1,3}\.\d{4}$")


def fail():
    sys.exit(1)


def parse_seconds(text, limit):
    if not re.fullmatch(r"[1-9][0-9]{0,1}", text or ""):
        return None
    value = int(text)
    if value < 1 or value > limit:
        return None
    return value


def point_ok(text, limit):
    if not FOUR.fullmatch(text or ""):
        return False
    value = float(text)
    return abs(value) <= limit


def build(argv):
    if len(argv) < 2:
        return None
    op = argv[1]
    if op not in CAPS:
        return None
    cap = CAPS[op]
    if op in DEADLINES:
        if len(argv) != 2:
            return None
        seconds = DEADLINES[op]
        host, url, headers = fixed_url(op, [])
    else:
        # zip/radio/wttr: script, op, arg, seconds (4). points adds lon (5).
        if len(argv) != (5 if op == "points" else 4):
            return None
        seconds = parse_seconds(argv[-1], 20)
        if seconds is None:
            return None
        host, url, headers = fixed_url(op, argv[2:-1])
    if not host:
        return None
    return op, host, url, headers, cap, seconds


def fixed_url(op, args):
    if op == "icecast":
        return "wxradio.org", "https://wxradio.org/status-json.xsl", []
    if op == "ccl":
        return "www.weather.gov", "https://www.weather.gov/source/nwr/JS/ccl-data.js", []
    if op == "zip":
        if len(args) != 1 or not ZIP.fullmatch(args[0]):
            return None, None, None
        return "api.zippopotam.us", "https://api.zippopotam.us/us/" + args[0], []
    if op == "points":
        if len(args) != 2 or not point_ok(args[0], 90) or not point_ok(args[1], 180):
            return None, None, None
        url = "https://api.weather.gov/points/" + args[0] + "," + args[1]
        return "api.weather.gov", url, ["Accept: application/geo+json"]
    if op == "radio":
        if len(args) != 1 or not CALL.fullmatch(args[0]):
            return None, None, None
        url = "https://api.weather.gov/radio/" + args[0]
        return "api.weather.gov", url, ["Accept: application/ld+json"]
    if op == "wttr":
        if args:
            return None, None, None
        return "wttr.in", "https://wttr.in/?format=j1", []
    return None, None, None


def global_address(host):
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return None
    for info in infos:
        try:
            address = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if address.is_global:
            text = address.compressed if address.version == 6 else str(address)
            return "[" + text + "]" if address.version == 6 else text
    return None


def stop(proc, sig):
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, sig)
    except OSError:
        try:
            proc.send_signal(sig)
        except OSError:
            pass


def read_bounded(proc, cap, deadline):
    out = b""
    err = b""
    out_fd = proc.stdout.fileno()
    err_fd = proc.stderr.fileno()
    open_fds = {out_fd, err_fd}
    while open_fds:
        if time.monotonic() >= deadline:
            stop(proc, signal.SIGKILL)
            proc.wait(timeout=2)
            return None
        timeout = max(0.05, min(0.5, deadline - time.monotonic()))
        ready, _, _ = select.select(list(open_fds), [], [], timeout)
        if not ready and proc.poll() is not None:
            # Drain anything still buffered after exit.
            ready = list(open_fds)
        for fd in ready:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                chunk = b""
            if not chunk:
                open_fds.discard(fd)
                continue
            if fd == out_fd:
                out += chunk
                if len(out) > cap:
                    stop(proc, signal.SIGKILL)
                    proc.wait(timeout=2)
                    return None
            else:
                if len(err) < 4096:
                    err += chunk
                if len(err) >= 4096:
                    stop(proc, signal.SIGKILL)
                    proc.wait(timeout=2)
                    return None
        if proc.poll() is not None and not open_fds:
            break
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        stop(proc, signal.SIGKILL)
        proc.wait(timeout=2)
        return None
    if proc.returncode != 0 or len(out) > cap:
        return None
    return out


def main(argv):
    built = build(argv)
    if not built:
        fail()
    _op, host, url, headers, cap, seconds = built
    ip = global_address(host)
    if not ip:
        fail()
    deadline = time.monotonic() + seconds
    cmd = [
        CURL, "-q", "-sS", "--fail",
        "--proto", "=https",
        "--proto-redir", "=https",
        "--noproxy", "*",
        "--max-time", str(seconds),
        "--connect-timeout", str(min(5, seconds)),
        "--max-filesize", str(cap),
        "--compressed",
        "--resolve", "%s:443:%s" % (host, ip),
        "-A", UA,
    ]
    for header in headers:
        cmd.extend(["-H", header])
    cmd.extend(["--", url])
    proc = None

    def on_term(_signum, _frame):
        stop(proc, signal.SIGTERM)
        sys.exit(1)

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
    except FileNotFoundError:
        sys.stderr.write("icestream: curl not found\n")
        fail()
    except OSError:
        fail()
    body = read_bounded(proc, cap, deadline)
    if body is None:
        fail()
    sys.stdout.buffer.write(body)


if __name__ == "__main__":
    try:
        os.setsid()
    except OSError:
        pass
    main(sys.argv)
