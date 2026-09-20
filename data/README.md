`broadcastify-nwr.json` is a hand-maintained map of NOAA Weather Radio call signs to Broadcastify **listen pages** (`https://www.broadcastify.com/listen/feed/{id}`).

It is not a stream catalog. The plugin only opens those pages in the browser. Do not add `audio.broadcastify.com` URLs here.

`online` is a hand-maintained hint (true/false) so the panel can label live vs offline pages. The plugin does not poll Broadcastify. Update the flag when you notice a feed has come back or gone dark.
