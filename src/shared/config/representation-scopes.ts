import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECTION_TO_BUNDLE_KEY, type SettingsSection } from '@/shared/config/sections'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * The section-scoped REPRESENTATION GENERATIONS.
 *
 * A representation's cache key / ETag must change when, and only when, one of the
 * settings it actually renders changes: hashing the whole bundle would let a
 * backup/mail/security save invalidate every cached page.
 *
 * The value is CONTENT-ADDRESSED (a hash of the listed sections), not a process
 * counter, so two boots with identical settings produce identical revisions and
 * cached feed/calendar/OG rows survive a restart. The boot-unique
 * `AppLocalization.revision` stays the request-identity / locale-sync token and is
 * never used for representation keys.
 *
 * The section lists are the single source of truth shared by every consumer: the
 * feed/calendar/OG resources, the manifest, the comments digest and the
 * detail/listing page shell. Add a section here when a render surface starts
 * reading it; a contract test pins the public render reads to this table.
 */
export const REPRESENTATION_SCOPES = [
  'detail',
  'listing',
  'feed',
  'calendar',
  'og',
  'manifest',
  'sitemap',
  'comments',
] as const

export type RepresentationScope = (typeof REPRESENTATION_SCOPES)[number]

export type RepresentationRevisions = Record<RepresentationScope, string>

/**
 * The public document shell both detail and listing render: identity/locale,
 * favicons + branding, navigation/footer, SEO/meta, listing copy, sidebar widgets,
 * comment UI copy/options, the Webmention discovery link and the self-hosted font
 * links. Kept in the canonical section order.
 */
const PAGE_RENDER_SECTIONS: readonly SettingsSection[] = [
  'general',
  'assets',
  'navigation',
  'socials',
  'content',
  'sidebar',
  'comments',
  'webmentions',
  'seo',
  'fonts',
]

export const REPRESENTATION_SECTION_DEPS: Record<RepresentationScope, readonly SettingsSection[]> = {
  detail: PAGE_RENDER_SECTIONS,
  listing: PAGE_RENDER_SECTIONS,
  // feed XML: site identity, feed size/full flag, branding in the channel image.
  feed: ['general', 'content', 'assets'],
  // calendar PNG: locale, daily-quote source/bank, canvas font family.
  calendar: ['general', 'sidebar', 'fonts'],
  // OG card: site title/website, configured OG dimensions, canvas font family.
  og: ['general', 'seo', 'fonts'],
  // webmanifest: name/lang, icon branding.
  manifest: ['general', 'assets'],
  // sitemap.xml: every <loc> is built from the site origin.
  sitemap: ['general'],
  // latest-comments digest: comment settings; the widget COUNT is a key input.
  comments: ['comments'],
}

const HASH_VERSION = 'v1'

/**
 * Encrypted settings secret FIELD NAMES (kept in step with the server's
 * `SECRET_FIELDS` by a contract test). They are never rendered, so hashing
 * them would both leak-derived key material into a cache key and invalidate
 * pages on a credential rotation.
 */
export const SETTINGS_SECRET_FIELD_NAMES: ReadonlySet<string> = new Set([
  'smtpPass',
  'mailgunApiKey',
  'secretAccessKey',
  'githubToken',
  'password',
  'rumClientToken',
])

/** Deterministic JSON: object keys sorted, `undefined` members dropped, arrays in order. */
function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = unsafeCast<Record<string, unknown>>(value)
    const members = Object.keys(record)
      .filter((key) => record[key] !== undefined && !SETTINGS_SECRET_FIELD_NAMES.has(key))
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    return `{${members.join(',')}}`
  }
  return 'null'
}

/**
 * FNV-1a 64-bit as hex. Pure JS (no `node:crypto`, no DOM) so the same value
 * computes in the server and client bundles; 64 bits makes an accidental cache-key
 * collision between two settings generations negligible.
 */
function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index))
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

// Per-bundle memo: the snapshot object is replaced wholesale on refresh and never
// mutated in place, so object identity is a sound key. One request therefore hashes
// the bundle once (and each unique dependency list once), and every scope/consumer
// reuses the same frozen object.
const revisionsByBundle = new WeakMap<BlogSettingsBundle, RepresentationRevisions>()

/** Pre-install is a constant — no bundle object to key a WeakMap on. */
const PRE_INSTALL_REVISIONS: RepresentationRevisions = Object.freeze(computeRevisions(null))

function computeRevisions(bundle: BlogSettingsBundle | null): RepresentationRevisions {
  const revisions: RepresentationRevisions = {
    detail: '',
    listing: '',
    feed: '',
    calendar: '',
    og: '',
    manifest: '',
    sitemap: '',
    comments: '',
  }
  // Scopes that share a dependency list (detail/listing) share one hash.
  const byDependencyList = new Map<string, string>()
  for (const scope of REPRESENTATION_SCOPES) {
    const dependencies = REPRESENTATION_SECTION_DEPS[scope]
    const cacheKey = dependencies.join('|')
    let revision = byDependencyList.get(cacheKey)
    if (revision === undefined) {
      const payload = dependencies.map((section) => [section, bundle?.[SECTION_TO_BUNDLE_KEY[section]] ?? null])
      revision = `${HASH_VERSION}-${fnv1a64(stableSerialize(payload))}`
      byDependencyList.set(cacheKey, revision)
    }
    revisions[scope] = revision
  }
  return Object.freeze(revisions)
}

/**
 * Resolve every representation's generation from ONE pinned bundle. Pass the same
 * bundle the renderer uses — never re-read the process snapshot here. Memoized by
 * bundle identity: repeated calls return the SAME frozen object; a refreshed
 * bundle is a new object and recomputes.
 */
export function representationRevisionsFor(bundle: BlogSettingsBundle | null): RepresentationRevisions {
  if (bundle === null) {
    return PRE_INSTALL_REVISIONS
  }
  const cached = revisionsByBundle.get(bundle)
  if (cached !== undefined) {
    return cached
  }
  const computed = computeRevisions(bundle)
  revisionsByBundle.set(bundle, computed)
  return computed
}
