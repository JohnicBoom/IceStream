#!/usr/bin/python3
"""Safe reads and writes for IceStream's own files.

State and weather are anchored at the passwd home, not $HOME. A mismatched
HOME (the integration harness) reads nothing and refuses to write. The
settings file is replaced inside its own directory so a stand-in link is
not followed. Manifest and bundle reads do not use the HOME check.
"""

import errno
import fcntl
import json
import os
import pwd
import re
import secrets
import stat
import sys

STATE_CAP = 8192
WEATHER_CAP = 8192
MANIFEST_CAP = 8192
BUNDLE_CAP = 512 * 1024
CALL = re.compile(r"^[A-Z][A-Z0-9]{4,5}$")
MOUNT = re.compile(r"^[A-Za-z0-9._~-]+(?:/[A-Za-z0-9._~-]+)?$")
STATE_KEYS = {"station", "volume", "networkLocate"}
STATION_KEYS = {"callSign", "streamUrl", "siteName", "siteCity", "siteState", "frequency", "mount"}


def passwd_home():
    home = pwd.getpwuid(os.getuid()).pw_dir
    if not home or not home.startswith("/"):
        raise OSError("passwd home is not absolute")
    return home


def home_isolated():
    env = os.environ.get("HOME")
    if env is None:
        return False
    try:
        expected = os.path.realpath(passwd_home())
        got = os.path.realpath(env) if env else ""
    except OSError:
        return True
    return got != expected


def open_home():
    try:
        fd = os.open(passwd_home(), os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    except OSError:
        return None
    st = os.fstat(fd)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
        os.close(fd)
        return None
    return fd


def open_dir(parent, name, create):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    try:
        fd = os.open(name, flags, dir_fd=parent)
    except FileNotFoundError:
        if not create:
            return None
        try:
            os.mkdir(name, 0o700, dir_fd=parent)
            fd = os.open(name, flags, dir_fd=parent)
        except OSError:
            return None
    except OSError:
        return None
    st = os.fstat(fd)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
        os.close(fd)
        return None
    return fd


def walk(parts, create):
    fd = open_home()
    if fd is None:
        return None
    for name in parts:
        if name in ("", ".", "..") or "/" in name or "\0" in name:
            os.close(fd)
            return None
        nxt = open_dir(fd, name, create)
        os.close(fd)
        if nxt is None:
            return None
        fd = nxt
    if create:
        try:
            os.fchmod(fd, 0o700)
        except OSError:
            os.close(fd)
            return None
    return fd


def read_fd(fd, cap, repair):
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1:
        return None
    if st.st_size > cap:
        return None
    if repair and stat.S_IMODE(st.st_mode) != 0o600:
        os.fchmod(fd, 0o600)
    data = b""
    while len(data) <= cap:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        data += chunk
        if len(data) > cap:
            return None
    return data


def read_named(dirfd, name, cap, repair):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
    try:
        fd = os.open(name, flags, dir_fd=dirfd)
    except FileNotFoundError:
        return b""
    except OSError as exc:
        if exc.errno in (errno.ELOOP, errno.EAGAIN, errno.ENXIO):
            return b""
        return b""
    try:
        data = read_fd(fd, cap, repair)
        return b"" if data is None else data
    finally:
        os.close(fd)


def read_path(path, expected, cap):
    if not path or not os.path.isabs(path) or os.path.basename(path) != expected:
        sys.exit(2)
    if "\0" in path or "\n" in path:
        sys.exit(2)
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
    try:
        fd = os.open(path, flags)
    except OSError:
        return b""
    try:
        data = read_fd(fd, cap, False)
        return b"" if data is None else data
    finally:
        os.close(fd)


def emit(data):
    if data:
        sys.stdout.buffer.write(data)


def read_state():
    if home_isolated():
        return b""
    leaf = walk([".local", "state", "icestream"], False)
    if leaf is None:
        return b""
    try:
        try:
            os.fchmod(leaf, 0o700)
        except OSError:
            return b""
        return read_named(leaf, "state.json", STATE_CAP, True)
    finally:
        os.close(leaf)


def read_weather():
    if home_isolated():
        return b""
    leaf = walk([".local", "state", "omarchy", "settings"], False)
    if leaf is None:
        return b""
    try:
        # Omarchy's weather.json is mode 644. Do not chmod it.
        return read_named(leaf, "weather.json", WEATHER_CAP, False)
    finally:
        os.close(leaf)


def text_field(value, limit, pattern=None):
    if not isinstance(value, str) or len(value) > limit or "\0" in value:
        return False
    if pattern and not pattern.fullmatch(value):
        return False
    return True


def station_ok(station):
    if station is None:
        return True
    if not isinstance(station, dict) or not set(station).issubset(STATION_KEYS):
        return False
    call = station.get("callSign")
    url = station.get("streamUrl")
    if not text_field(call, 6, CALL) or not isinstance(url, str):
        return False
    prefix = "http://wxradio.org:8000/"
    if not url.startswith(prefix) or len(url) > len(prefix) + 80:
        return False
    mount = url[len(prefix):]
    if not MOUNT.fullmatch(mount):
        return False
    if any(part in ("", ".", "..") for part in mount.split("/")):
        return False
    for key, limit in (("siteName", 64), ("siteCity", 64), ("frequency", 16), ("mount", 80)):
        if key in station and not text_field(station[key], limit):
            return False
    if "siteState" in station and not text_field(station["siteState"], 2, re.compile(r"^[A-Z]{2}$")):
        return False
    return True


def payload_ok(raw):
    if len(raw) > STATE_CAP or b"\n" in raw or b"\0" in raw:
        return False
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict) or not set(data).issubset(STATE_KEYS):
        return False
    volume = data.get("volume", None)
    if volume is not None and (type(volume) is not int or volume < 0 or volume > 130):
        return False
    if "networkLocate" in data and type(data["networkLocate"]) is not bool:
        return False
    return station_ok(data.get("station", None))


def read_stdin_line(limit):
    buf = bytearray()
    while len(buf) <= limit:
        try:
            chunk = os.read(0, 1)
        except OSError:
            return None
        if not chunk:
            return None
        if chunk == b"\n":
            return bytes(buf)
        buf += chunk
    return None


def open_lock(dirfd):
    flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC
    try:
        fd = os.open("state.lock", flags, 0o600, dir_fd=dirfd)
    except OSError as exc:
        if exc.errno != errno.ELOOP:
            return None
        try:
            os.unlink("state.lock", dir_fd=dirfd)
            fd = os.open("state.lock", os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=dirfd)
        except OSError:
            return None
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1:
        os.close(fd)
        try:
            info = os.stat("state.lock", dir_fd=dirfd, follow_symlinks=False)
        except OSError:
            return None
        if stat.S_ISDIR(info.st_mode):
            return None
        try:
            os.unlink("state.lock", dir_fd=dirfd)
            fd = os.open("state.lock", os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=dirfd)
        except OSError:
            return None
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1:
            os.close(fd)
            return None
    if stat.S_IMODE(st.st_mode) != 0o600:
        try:
            os.fchmod(fd, 0o600)
        except OSError:
            os.close(fd)
            return None
    return fd


def write_all(fd, data):
    view = memoryview(data)
    while view:
        wrote = os.write(fd, view)
        if wrote <= 0:
            raise OSError("short write")
        view = view[wrote:]


def replace_file(dirfd, name, payload):
    lock = open_lock(dirfd)
    if lock is None:
        return False
    tmp = None
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        tmp = "." + name + "." + secrets.token_hex(8)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
        fd = os.open(tmp, flags, 0o600, dir_fd=dirfd)
        try:
            write_all(fd, payload)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.rename(tmp, name, src_dir_fd=dirfd, dst_dir_fd=dirfd)
        tmp = None
        os.fsync(dirfd)
        return True
    except OSError:
        if tmp:
            try:
                os.unlink(tmp, dir_fd=dirfd)
            except OSError:
                pass
        return False
    finally:
        os.close(lock)


def write_state():
    if home_isolated():
        sys.exit(1)
    raw = read_stdin_line(STATE_CAP)
    if raw is None or not payload_ok(raw):
        sys.exit(1)
    leaf = walk([".local", "state", "icestream"], True)
    if leaf is None:
        sys.exit(1)
    try:
        if not replace_file(leaf, "state.json", raw + b"\n"):
            sys.exit(1)
    finally:
        os.close(leaf)


def main(argv):
    if len(argv) < 2:
        sys.exit(2)
    op = argv[1]
    if op == "read-state" and len(argv) == 2:
        emit(read_state())
    elif op == "read-weather" and len(argv) == 2:
        emit(read_weather())
    elif op == "read-manifest" and len(argv) == 3:
        emit(read_path(argv[2], "manifest.json", MANIFEST_CAP))
    elif op == "read-bundle" and len(argv) == 3:
        emit(read_path(argv[2], "nwr-transmitters.json", BUNDLE_CAP))
    elif op == "write-state" and len(argv) == 2:
        write_state()
    else:
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv)
