# Agent Note: Web PWA install and asset-cache contract

Status: implemented

English | [中文](2026-09-02-web-pwa-install-and-asset-cache.zh.md)

## Problem

The built web app shipped install metadata (a web app manifest and an SVG favicon) served by `@deepseek-ai/dsh-host-frontend-static`, but no browser could treat it as a first-class installed app: the manifest pinned kiosk-style `fullscreen`, the only icon was an SVG that iOS ignores and that cannot carry a maskable safe zone, no service worker existed, and the static server's MIME table had no `.png` row. Adding these naively is unsafe for this app in two directions. `dsh web` renders `index.html` per request — injecting `window.__DSH_BOOT__` (the client module graph), the boot-readiness tail, and the configured title — so a cached page would boot a stale module graph or fail outright. And the worker-preview deployment runs the same built entry on arbitrary origins and base directories, where a service worker must never register.

## Decision

**The served app is installable as a standalone window, and the service worker caches only what the server cannot re-render.**

- The manifest pins `display: standalone` with `display_override: ["standalone", "minimal-ui"]`: an own window with OS chrome, falling back to minimal-ui on constrained viewports.
- `apps/web/scripts/generate-icons.ts` renders the committed raster icons from `public/favicon.svg` (the build copies `public/` verbatim and must not require a browser): 192 and 512 `purpose: any`, 192 and 512 `purpose: maskable` with the mark held inside the central-80% safe zone, and a 180 `apple-touch-icon` linked from `index.html`. Every raster bakes the dark-scheme look — white mark on an opaque black tile — because installed icons meet both light and dark desktops, transparent marks vanish on dark docks, and iOS fills transparency with black.
- `apps/web/src/sw.ts` emits to fixed root filename `sw.js` (registration URL stability) with no imports and no top-level await, so the file parses as a classic service-worker script. Its cache contract is directional: every navigation passes through to the network; a same-origin GET under the scope's `assets/` directory is answered cache-first and filled from the network on a miss; everything else passes through. Activation drops every cache name except `dsh-web-assets-v1`, whose only contents are immutable content-hashed assets, and registration uses `updateViaCache: 'none'`.
- Registration in `apps/web/src/main.ts` happens only in a production build with `serviceWorker` available and no `__DSH_PREVIEW_PAGE__` global. The discriminator is build-owned: `emitPreviewPage` splices `<script>globalThis.__DSH_PREVIEW_PAGE__ = true</script>` ahead of every module script of `preview.html`, so the app entry sees the marker deterministically.
- The `@deepseek-ai/dsh-host-frontend-static` MIME table ships `.png`.

## Verification

The `frontend-static` real-Loader composition spec pins `/icon-192.png` served as `image/png`. `apps/web/tests/pwa-manifest.e2e.ts` pins the built manifest object, the apple-touch link, the shipped icon files, and the emitted `sw.js`. `apps/web/tests/pwa-service-worker.e2e.ts` boots a real Chromium against the verbatim dist and proves both directions of the contract: a warmed asset answers offline with the HTTP cache bypassed, and an offline navigation fails closed instead of returning a cached page. `apps/web/tests/preview-boot.e2e.ts` pins the marker on the chooser page and that `serviceWorker.controller` stays null through the fully booted preview.

## Alternatives considered

**Cache the app shell and serve navigations offline.** Rejected: the served index is per-request server state — boot injection, title, module graph. A cache-served page would boot a plugin graph that no longer matches the served bundles, which is the exact failure the boot-manifest contract exists to prevent.

**vite-plugin-pwa / Workbox.** Rejected: the plugin's default model precaches a shell and registers a navigation fallback, contradicting the server-owned index, while the fitting policy here is one cache-first rule over hashed assets — smaller than the plugin's configuration surface, dependency-free, and under full control of the classic-script constraint.

**Gate registration on the transport global (`__DSH_TRANSPORT__`).** Rejected on evidence: the preview bootstrap's top-level await does not order the app entry behind it, so the entry could evaluate before the transport exists and register on preview origins — the preview e2e failed on exactly this race before the build-time marker replaced it.

**Keep `fullscreen`.** Rejected: kiosk mode hides OS window chrome on every launch, which is wrong for a developer console used beside an editor and a terminal; nothing in the product is immersive.

## Consequences

- An installed DSH opens as its own window with OS chrome, carries dock/home-screen icons that hold up on both light and dark desktops, and reloads hashed assets from cache without waiting on the local server.
- An offline reload shows the browser's own failure. This is deliberate: in-session disconnects are the app's connection-state concern, and a static offline screen would need locale-owned copy while still being unable to reach the server.
- The cache accumulates one release's hashed assets per update until a cache-name bump prunes them; accepted because assets are immutable and each release is a few megabytes.
- A static-host-served `index.html` from the preview payload registers the worker (no marker on that page); this is harmless because navigations are never cached and payload assets are hashed.
- A `dsh web` index path other than the dist root resolves `sw.js` beside the page; where no such file is served, registration fails to a console warning and the app runs unharmed.
