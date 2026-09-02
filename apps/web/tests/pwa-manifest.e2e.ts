import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')
  expect(index).toContain('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'DeepSeek Harness',
    short_name: 'DSH',
    start_url: '/',
    scope: '/',
    // Installed windows open like an app: own window, OS chrome kept — the
    // kiosk-style `fullscreen` mode is wrong for a developer console.
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    icons: [{
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }, {
      src: '/icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    }, {
      src: '/icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    }, {
      src: '/icons/maskable-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    }, {
      src: '/icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    }],
  })

  // The raster icons and apple-touch icon are committed public assets the
  // Vite build copies verbatim; a manifest entry whose file never ships would
  // fail install criteria only at install time.
  for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png']) {
    expect(existsSync(join(DIST_ROOT, icon)), icon).toBe(true)
  }
})

it('ships a favicon that switches to a light mark under dark color scheme', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // The light fill must live inside the dark-scheme media query, so the icon
  // stays black in light mode and only turns white under a dark scheme.
  expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*path\s*{[^}]*fill:\s*#fff/i)
  expect(favicon).toContain('fill="#000"')
})

it('ships the asset-cache service worker beside the served page', async () => {
  // The worker is a fixed-root build entry (registration URL stability), and
  // its caching contract — cache-first over `assets/`, navigations never
  // cached — is exercised end to end by pwa-service-worker.e2e.ts.
  const worker = await readFile(join(DIST_ROOT, 'sw.js'), 'utf8')
  expect(worker).toContain('dsh-web-assets-v1')
})
