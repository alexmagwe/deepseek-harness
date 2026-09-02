/**
 * Asset-cache service worker for the web app. Only pages served by `dsh web`
 * register it (see `src/main.ts`): the worker preview deployment owns bundle
 * bytes through its transport bootstrap, and dev servers must leave HMR
 * untouched.
 *
 * Caching policy. The served index.html is rendered per request — `dsh web`
 * injects `window.__DSH_BOOT__` (the client module graph), the boot-readiness
 * tail, and the configured title — so navigations always pass through to the
 * network and are never answered from a cache. Content-hashed `assets/` URLs
 * are immutable, so they are answered cache-first and filled from the network
 * on a miss. Everything else passes through unchanged.
 */

/** Worker-scoped event surface; the DOM lib carries no service-worker types. */
interface WorkerEvent extends Event {
  waitUntil(promise: Promise<void>): void
}

/** The fetch event the worker must answer. */
interface WorkerFetchEvent extends Event {
  request: Request
  respondWith(response: Promise<Response> | Response): void
}

/** The narrowed service-worker-global surface this file uses. */
interface WorkerScope {
  location: { origin: string }
  registration: { scope: string }
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  addEventListener(type: 'install' | 'activate', listener: (event: WorkerEvent) => void): void
  addEventListener(type: 'fetch', listener: (event: WorkerFetchEvent) => void): void
}

const sw = self as unknown as WorkerScope

const CACHE_NAME = 'dsh-web-assets-v1'

/** Scope-relative directory of the Vite-emitted, content-hashed build assets. */
const ASSETS_DIRECTORY = 'assets/'

sw.addEventListener('install', (event) => {
  // The worker caches immutable assets only, so activation can be immediate.
  event.waitUntil(sw.skipWaiting())
})

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Caches written by earlier policy versions hold no live contract: every
    // name but the current one predates this file, so drop them. The current
    // cache holds only immutable hashed assets and never misleads a page.
    const names = await caches.keys()
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))
    await sw.clients.claim()
  })())
})

sw.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== sw.location.origin) return
  const scopePath = new URL(sw.registration.scope).pathname
  if (!url.pathname.startsWith(scopePath + ASSETS_DIRECTORY)) return
  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached !== undefined) return cached
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      try {
        await cache.put(request, response.clone())
      } catch {
        // Storage quota may reject the write; the fetched response is already
        // valid and still reaches the page.
      }
    }
    return response
  })())
})
