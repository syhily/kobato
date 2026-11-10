// The message-catalog scope split: PUBLIC pages ship only the messages their
// routes can render, the workspace (/admin, /editor) ships the complete UI catalog
// (+ the Inkling label table for authenticated documents). The scope is derived
// from the document pathname — the ONE classifier both the root
// `shouldRevalidate` (client navigation) and `content.bootstrap` (server payload)
// use, so a navigation can never keep a public payload on a workspace page or vice
// versa.
//
// Client-safe on purpose: root.tsx is part of the client bundle and must not
// value-import `catalog.ts` (the server-only aggregator). This module holds no
// catalogs, only the boundary rules.

/** Which message payload a document needs. */
export type CatalogScope = 'public' | 'workspace'

/** URL prefixes whose routes render admin/editor chrome. */
export const WORKSPACE_PATH_PREFIXES = ['/admin', '/editor'] as const

/**
 * The message namespaces a PUBLIC document may render, and the complete definition
 * of the public payload: the families reachable from `routes/public`, `ui/public`,
 * the shared notifications drawer, the public chrome and the isomorphic helpers
 * those modules call. `backup.*`, `storage.*`, `update.*`, `images.*`, `content.*`,
 * `users.*`, `fonts.*`, `analytics.*`, `taxonomy.*`, `admin.*` (except the shared
 * drawer's action toasts) and friends stay workspace-only chrome no anonymous
 * visitor can reach.
 *
 * Keep this a positive ALLOWLIST: a new admin panel namespace must not become
 * public copy just because nobody remembered to deny it.
 * `tests/unit/arch/public-message-namespaces.test.ts` pins that public sources only
 * reference keys from this registry and that the shipped public catalog is exactly
 * it.
 */
export const PUBLIC_MESSAGE_PREFIXES = [
  'auth.',
  'common.',
  'error.',
  'meta.',
  'notifications.',
  'public.',
  'validation.',
  // The notifications drawer is mounted on public pages too (the visitor/admin
  // user menu); its admin-only action toasts stay reachable for a signed-in
  // admin, so this ONE admin sub-namespace ships publicly.
  'admin.toast.',
] as const

/** True for `/admin`, `/editor` and everything beneath them (never `/administrator`). */
export function isWorkspacePath(pathname: string): boolean {
  return WORKSPACE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** The payload scope a document pathname resolves to. */
export function catalogScopeForPathname(pathname: string): CatalogScope {
  return isWorkspacePath(pathname) ? 'workspace' : 'public'
}

/** True when a public document may render this message id. */
export function isPublicMessageKey(key: string): boolean {
  return PUBLIC_MESSAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}
