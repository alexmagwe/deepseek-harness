/**
 * Service-worker acceptance for the served app, over the built dist the same
 * way a static host serves it: verbatim bytes, no rewrite rules. The served
 * index is server-rendered by `dsh web` in production (boot injection, title),
 * so the worker's caching contract is directional — hashed `assets/` URLs are
 * answered cache-first, navigations are never answered from a cache. This run
 * proves both directions in a real Chromium: a warmed asset survives offline
 * while the index navigation fails closed.
 *
 * The page itself fails its boot on this fixture (no injected
 * `window.__DSH_BOOT__`), which is fine: registration happens at entry
 * evaluation and does not depend on the app reaching chat.
 */
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { expect, it } from 'vitest'
import { DIST_INDEX, probeFreePort, saveFailureShot } from './support.ts'

const DIST_ROOT = dirname(DIST_INDEX)

/** Content types the app loads; anything else is served as opaque bytes. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

it('caches hashed build assets and never serves the rendered page from cache', { timeout: 120_000 }, async () => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error('web app dist not built — run `pnpm run build` from the repository root')
  }
  const assetName = readdirSync(join(DIST_ROOT, 'assets')).find(name => name.endsWith('.js'))
  if (assetName === undefined) throw new Error('web app dist carries no built asset chunks')

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    // The site root is the served page, exactly as `dsh web` renders it.
    const target = pathname === '/' ? 'index.html' : pathname
    readFile(join(DIST_ROOT, target)).then((body) => {
      response.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' })
      response.end(body)
    }, () => {
      response.writeHead(404)
      response.end()
    })
  })
  const port = await probeFreePort()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  const browser = await chromium.launch()
  let page: Page | undefined
  try {
    const context = await browser.newContext()
    page = await context.newPage()
    const origin = `http://127.0.0.1:${String(port)}`

    await page.goto(`${origin}/`)
    // clients.claim() puts the activated worker in control of this first page.
    await page.waitForFunction(() => window.navigator.serviceWorker.controller !== null, undefined, { timeout: 15_000 })

    // Warm the worker cache from the controlled page: the fetch is
    // intercepted, misses the cache, and fills it from the network.
    const asset = `${origin}/assets/${assetName}`
    const warmed = await page.evaluate(async url => (await fetch(url, { cache: 'reload' })).ok, asset)
    expect(warmed).toBe(true)

    // Offline with the HTTP cache bypassed, only the service worker can answer.
    await context.setOffline(true)
    const served = await page.evaluate(async (url) => {
      const response = await fetch(url, { cache: 'reload' })
      return { ok: response.ok, body: await response.text() }
    }, asset)
    expect(served.ok).toBe(true)
    expect(served.body).toBe(await readFile(join(DIST_ROOT, 'assets', assetName), 'utf8'))

    // The rendered index is server-owned: offline it must fail closed rather
    // than come back from a cache with a stale boot injection.
    await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/)
    await context.setOffline(false)
  } catch (error) {
    if (page !== undefined) await saveFailureShot(page, 'pwa-service-worker')
    throw error
  } finally {
    await browser.close()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  }
})
