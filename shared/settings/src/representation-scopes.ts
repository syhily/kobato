import type { BlogSettingsBundle } from '@kobato/settings/types'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { SECRET_FIELDS } from '@kobato/settings/secrets'
import { SECTION_TO_BUNDLE_KEY, type SettingsSection } from '@kobato/settings/sections'

export const REPRESENTATION_SCOPES = ['detail', 'listing', 'feed', 'calendar', 'og', 'manifest', 'sitemap'] as const

export type RepresentationScope = (typeof REPRESENTATION_SCOPES)[number]

export type RepresentationRevisions = Record<RepresentationScope, string>

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
  feed: ['general', 'content', 'assets'],
  calendar: ['general', 'sidebar', 'fonts'],
  og: ['general', 'seo', 'fonts'],
  manifest: ['general', 'assets'],
  sitemap: ['general'],
}

const HASH_VERSION = 'v1'

export const SETTINGS_SECRET_FIELD_NAMES: ReadonlySet<string> = new Set(SECRET_FIELDS.map((field) => field.field))

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

const revisionsByBundle = new WeakMap<BlogSettingsBundle, RepresentationRevisions>()

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
  }
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
