/**
 * Raster icon generator: renders the committed PNG app icons from the
 * `public/favicon.svg` mark. The PNGs are committed because `vite build`
 * copies `public/` verbatim and the build must not require a browser; rerun
 * this script after changing the favicon:
 *
 *   pnpm --filter @deepseek-ai/dsh-web-frontend icons
 *
 * The favicon adapts its fill through a `prefers-color-scheme` media query;
 * a raster icon cannot. The rasters bake the dark-scheme look — white mark on
 * an opaque black tile — because installed-app icons meet both light and dark
 * desktops: a transparent mark vanishes on dark docks, and iOS fills
 * transparency with black anyway.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'

const PUBLIC_ROOT = fileURLToPath(new URL('../public', import.meta.url))

/** The favicon viewBox is a 50×50 box around the mark. */
const MARK_BOX = 50

/** Rendered icons: output name, square size, and mark-to-tile ratio. */
const ICONS: ReadonlyArray<{ readonly name: string; readonly size: number; readonly markRatio: number }> = [
  { name: 'icon-192.png', size: 192, markRatio: 0.8 },
  { name: 'icon-512.png', size: 512, markRatio: 0.8 },
  // Maskable icons must keep the mark inside the platform safe zone — the
  // central 80% circle — so the mark is drawn well below the tile ratio used
  // by the plain icons.
  { name: 'maskable-192.png', size: 192, markRatio: 0.55 },
  { name: 'maskable-512.png', size: 512, markRatio: 0.55 },
  { name: 'apple-touch-icon.png', size: 180, markRatio: 0.8 },
]

/** Extract the single mark path from the favicon source. */
function markPath(favicon: string): string {
  const match = /\bd="([^"]+)"/.exec(favicon)
  if (match === null) throw new Error('generate-icons: favicon.svg carries no path d attribute')
  return match[1]!
}

/** Compose one opaque black tile with the mark centered at `markRatio`. */
function tileSvg(mark: string, size: number, markRatio: number): string {
  const scale = (size * markRatio) / MARK_BOX
  const offset = (size - size * markRatio) / 2
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" fill="#000"/>`,
    `<g transform="translate(${offset} ${offset}) scale(${scale})">`,
    `<path d="${mark}" fill="#fff" fill-rule="nonzero"/>`,
    '</g></svg>',
  ].join('')
}

const favicon = await readFile(join(PUBLIC_ROOT, 'favicon.svg'), 'utf8')
const mark = markPath(favicon)
const browser = await chromium.launch()
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    await page.setContent(`<!doctype html><style>html, body { margin: 0; padding: 0 }</style>${tileSvg(mark, icon.size, icon.markRatio)}`)
    await page.screenshot({ path: join(PUBLIC_ROOT, 'icons', icon.name) })
    await page.close()
    console.log(`wrote public/icons/${icon.name}`)
  }
} finally {
  await browser.close()
}
