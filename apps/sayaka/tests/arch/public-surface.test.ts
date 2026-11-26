import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8')
}

function sourceFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, root), { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

const FORWARDER_FILE = 'apps/sayaka/src/server/forward.ts'
const FORWARDER_FAMILIES = "const FORWARDED_FAMILIES = ['/rpc', '/admin', '/editor'] as const"

const ROUTES_FILE = 'apps/sayaka/src/routes.ts'
const PERIMETER_FILE = 'apps/sayaka/src/server/perimeter.ts'

const SAYAKA_ROUTE_ROWS = [
  "route('feed', 'routes/feed.ts')",
  "route('feed/atom', 'routes/feed-atom.ts')",
  "route('cats/:slug/feed', 'routes/category/feed.ts')",
  "route('cats/:slug/feed/atom', 'routes/category/feed-atom.ts')",
  "route('tags/:slug/feed', 'routes/tag/feed.ts')",
  "route('tags/:slug/feed/atom', 'routes/tag/feed-atom.ts')",
  "route('sitemap.xml', 'routes/sitemap-xml.ts')",
  "route('robots.txt', 'routes/robots-txt.ts')",
  "route('manifest.webmanifest', 'routes/manifest-webmanifest.ts')",
  "route('tags', 'routes/tags.ts')",
  "route('search', 'routes/search.ts')",
  "route('favicon.svg', 'routes/branding-asset.ts', { id: 'branding-favicon-svg' })",
  "route('favicon.ico', 'routes/branding-asset.ts', { id: 'branding-favicon-ico' })",
  "route('logo.svg', 'routes/branding-asset.ts', { id: 'branding-logo' })",
  "route('logo-dark.svg', 'routes/branding-asset.ts', { id: 'branding-logo-dark' })",
  "route('logo-large.svg', 'routes/branding-asset.ts', { id: 'branding-logo-large' })",
  "route('logo-large-dark.svg', 'routes/branding-asset.ts', { id: 'branding-logo-large-dark' })",
  "route('apple-touch-icon.png', 'routes/branding-asset.ts', { id: 'branding-apple-touch-icon' })",
  "route('images/icon-192.png', 'routes/branding-asset.ts', { id: 'branding-icon-192' })",
  "route('images/icon-512.png', 'routes/branding-asset.ts', { id: 'branding-icon-512' })",
  "route('images/open-graph.png', 'routes/branding-asset.ts', { id: 'branding-open-graph' })",
  "route('images/blog-poster.png', 'routes/branding-asset.ts', { id: 'branding-blog-poster' })",
  "route('images/blog-poster-dark.png', 'routes/branding-asset.ts', { id: 'branding-blog-poster-dark' })",
  "route('images/default-avatar.png', 'routes/branding-asset.ts', { id: 'branding-default-avatar' })",
  "route('images/default-music-cover.png', 'routes/branding-asset.ts', { id: 'branding-default-music-cover' })",
  "route('images/og/:filename', 'routes/images-og.ts')",
  "route('images/og/cats/:filename', 'routes/images-og-category.ts')",
  "route('images/calendar/:year/:filename', 'routes/images-calendar.ts')",
  "route('images/calendar/dark/:year/:filename', 'routes/images-calendar-dark.ts')",
  "route('images/avatar/:filename', 'routes/images-avatar.ts')",
  "route('fonts/embedded/*', 'routes/fonts-embedded.ts')",
  "route('storage/*', 'routes/storage.ts')",
]

const PERIMETER_HANDLER_ROWS = ['app.use(rumIntakeRelay)', 'app.use(webmentionReceive)']

describe('sayaka public surface — forwarding is final', () => {
  it('forwards exactly the /rpc and /admin+/editor path families and nothing else', () => {
    expect(read(FORWARDER_FILE)).toContain(FORWARDER_FAMILIES)
  })

  it('has no forwarding module beside forward.ts and no legacy-resource forwarder any more', () => {
    const forwarders = sourceFiles('apps/sayaka/src').filter(
      (file) => read(file).includes('forwardToKobato') && file !== FORWARDER_FILE,
    )
    expect(forwarders).toEqual([])
    expect(existsSync(join(REPO_ROOT, 'apps/sayaka/src/server/forward-legacy-resources.ts'))).toBe(false)
    expect(read(PERIMETER_FILE)).not.toContain('forwardLegacyResources')
  })

  it('answers the two inbound protocols in the perimeter itself — never by forwarding', () => {
    const perimeter = read(PERIMETER_FILE)
    for (const row of PERIMETER_HANDLER_ROWS) {
      expect(perimeter).toContain(row)
    }
    expect(perimeter).not.toContain("'/webmention'")
    expect(perimeter).not.toContain('/api/rum/intake')
  })

  it('registers every document-like and binary public URL family as a sayaka route', () => {
    const routes = read(ROUTES_FILE)
    const missing = SAYAKA_ROUTE_ROWS.filter((row) => !routes.includes(row))
    expect(missing).toEqual([])
  })
})
