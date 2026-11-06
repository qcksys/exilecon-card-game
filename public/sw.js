// Offline support: the rules, inventory and fight calculator work without a connection.
// Pages are network-first (so updates show up), hashed assets are cache-first, /api/* is never cached.
// Both placeholders are filled in at build time by the precache hook in astro.config.mjs.
const VERSION = "__SW_VERSION__";
const BUILD_ASSETS = "__PRECACHE_ASSETS__";
const ASSETS = Array.isArray(BUILD_ASSETS) ? BUILD_ASSETS : [];
const CACHE = `card-game-${VERSION}`;
const PAGES = [
    "/",
    "/cards/",
    "/fight/",
    "/rules/cards-and-symbols/",
    "/rules/equipment/",
    "/rules/fighting-monsters/",
    "/rules/progression/",
    "/faq/",
    "/reference/exilecon-2023/",
    "/sources/",
    "/favicon.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE);
            await Promise.all(
                [...PAGES, ...ASSETS].map(async (url) => {
                    try {
                        const res = await fetch(url, { cache: "reload" });
                        if (res.ok) await cache.put(url, res);
                    } catch {
                        // Offline during install: the file gets cached on first use instead.
                    }
                }),
            );
            await self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            for (const key of await caches.keys()) {
                if (key.startsWith("card-game-") && key !== CACHE) await caches.delete(key);
            }
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (
        req.method !== "GET" ||
        url.origin !== self.location.origin ||
        url.pathname.startsWith("/api/")
    )
        return;

    if (req.mode === "navigate") {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE);
                try {
                    const res = await fetch(req);
                    if (res.ok) cache.put(url.pathname, res.clone());
                    return res;
                } catch {
                    return (
                        (await cache.match(url.pathname)) ??
                        (await cache.match(`${url.pathname.replace(/\/?$/, "/")}`)) ??
                        (await cache.match("/")) ??
                        Response.error()
                    );
                }
            })(),
        );
        return;
    }

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE);
            const hit = await cache.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (
                res.ok &&
                (url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/images/"))
            ) {
                cache.put(req, res.clone());
            }
            return res;
        })(),
    );
});
