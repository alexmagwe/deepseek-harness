/** Browser entry for the Web client. */
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')

/**
 * Register the asset-cache service worker (`sw.js` beside the served page) on
 * pages served by `dsh web`. The worker preview deployment never registers:
 * its page carries the `__DSH_PREVIEW_PAGE__` marker (spliced in by the build
 * ahead of every module script) because it owns bundle bytes through its
 * transport bootstrap and may be mounted under any base directory.
 * Development servers stay registration-free so HMR is never intercepted.
 */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  const preview = (globalThis as { __DSH_PREVIEW_PAGE__?: unknown }).__DSH_PREVIEW_PAGE__
  if (preview !== undefined) return
  void navigator.serviceWorker
    .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
    .catch((reason: unknown) => {
      // Registration failure must not take the app down with it.
      console.warn('service worker registration failed', reason)
    })
}

registerServiceWorker()
void new AppWebEntry(el).run()
