// Deliberately does NOT intercept or cache anything. It exists only so
// browsers treat the app as installable; every request still goes straight
// to the network, so a deploy is never hidden behind a stale cached copy
// (that caching problem already cost us several rounds of "my fix isn't
// showing up").
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* no respondWith: the browser handles it normally */ });
