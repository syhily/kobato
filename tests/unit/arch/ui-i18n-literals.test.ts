/**
 * Hardcoded-UI-copy guard (plan 001, Step 1).
 *
 * Interface copy, validation messages, toast/DomainError text, hardcoded
 * locales and locale-less `toLocale*()` calls must not reach production source:
 * every one of them belongs to the message catalogs so all four locales stay
 * in step. The scanner is an AST walk (see `#/_helpers/i18n-literals`) with an
 * exact file/rule/snippet allowlist — never a blanket directory skip.
 *
 * `SCAN_ROOTS` grows with each migration slice and the final slice covers
 * `src/**`; exemptions are added per finding, with a reason.
 */

import { describe, expect, it } from 'vitest'

import {
  applyAllowlist,
  scanI18nLiterals,
  scanSourceForI18nLiterals,
  type ScanAllowlistEntry,
} from '#/_helpers/i18n-literals'

const SCAN_ROOTS = [
  // The i18n foundation.
  'src/shared/i18n',
  'src/server/infra/i18n.ts',
  // Step 3: common/auth/public surfaces.
  'src/ui/public',
  'src/ui/admin/auth',
  'src/routes/public',
  'src/routes/auth',
  // Step 4b: the migrated formatting + registry modules (no JSX copy lives in
  // these files, so the formatting rules — locale-less `toLocale*`, bare locale
  // literals — are enforced cleanly here).
  'src/shared/config/display.ts',
  'src/shared/cache/registry.ts',
  'src/shared/types/cache.ts',
  'src/shared/utils/roles.ts',
  'src/shared/utils/formatter.ts',
  'src/ui/admin/analytics/time-labels.ts',
  'src/ui/admin/editor-shell/wall-clock.ts',
  'src/ui/admin/settings/cache/cache-formatters.ts',
  'src/ui/admin/tasks/meta.ts',
  'src/ui/shared/notifications/notification-meta.ts',
  // Step 4d: the admin shell, settings surface and the shared UI primitives.
  'src/ui/admin/shell',
  'src/ui/admin/settings',
  'src/routes/admin/settings',
  'src/routes/admin/layout.tsx',
  'src/ui/components',
  // Step 4e: the business admin surface, the notifications drawer and the
  // remaining user-facing client modules (the editor family is 4f).
  'src/routes/admin',
  'src/ui/admin/analytics',
  'src/ui/admin/audit',
  'src/ui/admin/categories',
  'src/ui/admin/comments',
  'src/ui/admin/dashboard',
  'src/ui/admin/fonts',
  'src/ui/admin/friends',
  'src/ui/admin/images',
  'src/ui/admin/library',
  'src/ui/admin/musics',
  'src/ui/admin/my',
  'src/ui/admin/pages',
  'src/ui/admin/posts',
  'src/ui/admin/sessions',
  'src/ui/admin/shared',
  'src/ui/admin/tags',
  'src/ui/admin/tasks',
  'src/ui/admin/users',
  'src/ui/admin/webmentions',
  'src/ui/admin/welcome',
  'src/ui/shared',
  'src/client/hooks',
  'src/client/lib',
  'src/client/components',
  'src/client/api',
  // Step 4f: the editor slices — routes, the admin editor families and the
  // client host glue. The six post/page integration files are already covered
  // by the `src/ui/admin/posts` / `src/ui/admin/pages` roots above.
  'src/routes/editor',
  'src/ui/admin/editor',
  'src/ui/admin/editor-shell',
  'src/ui/admin/editor-shared',
  'src/client/editor',
  // Step 5a: the server error protocol — producers state typed descriptors and
  // the Hono/oRPC boundaries translate them; no raw DomainError copy may creep
  // back into these modules.
  'src/server/infra/http/errors.ts',
  'src/server/infra/http/error-descriptor.ts',
  'src/server/http/errors.ts',
  'src/server/http/orpc-base.ts',
  'src/server/http/translate-domain-error.ts',
  // Step 5a-ii: the remaining auth flows, the Hono perimeter middlewares and
  // the settings validation boundaries migrated to typed descriptors.
  'src/server/domains/auth/services',
  'src/server/domains/auth/passkey',
  'src/server/domains/auth/session-guard.ts',
  'src/server/domains/auth/schema.ts',
  'src/server/domains/settings/sections/assets.ts',
  'src/server/domains/settings/sections/security.ts',
  'src/server/domains/settings/services/section-patch.ts',
  'src/server/domains/settings/services/core.ts',
  'src/server/http/middlewares',
  'src/server/http/localized-http-exception.ts',
  'src/server/http/controllers/account.controller.ts',
  'src/server/http/controllers/admin/users-sessions.controller.ts',
  'src/server/http/controllers/admin/settings.controller.ts',
  // Step 5a-iii: settings sections, taxonomies, the content lifecycle and the
  // posts/pages controllers (entity nouns are machine kinds → ICU select).
  'src/server/domains/settings/sections',
  'src/server/domains/taxonomies',
  'src/server/domains/content',
  'src/server/domains/posts',
  'src/server/domains/pages',
  'src/server/domains/pt/services/lexical-canonicalize.ts',
  'src/server/infra/slug/resolve.ts',
  'src/server/infra/slug/reservation.ts',
  'src/server/http/controllers/admin/posts.controller.ts',
  'src/server/http/controllers/admin/pages.controller.ts',
  'src/server/http/controllers/admin/categories.controller.ts',
  'src/server/http/controllers/admin/tags.controller.ts',
  'src/server/http/controllers/admin/revision-router.ts',
] as const

const ALLOWLIST: readonly ScanAllowlistEntry[] = [
  // The locale module names every supported tag and alias by design — it IS
  // the single source of truth the rule checks against.
  { path: 'src/shared/i18n/locales.ts', rules: ['hardcoded-locale'] },
  // The catalog aggregator keys its per-locale maps and its English fallback
  // by tag; those literals are the catalog identity, not UI copy.
  { path: 'src/shared/i18n/catalog.ts', rules: ['hardcoded-locale'] },
  // The display facade maps app locales onto date-fns locales — same identity role.
  { path: 'src/shared/i18n/format.ts', rules: ['hardcoded-locale'] },
  // Weibo's share widget takes a hardcoded `language=zh_cn` PROTOCOL parameter;
  // it is never rendered to a reader.
  { path: 'src/ui/public/LikeActions.tsx', rules: ['hardcoded-locale'], text: 'zh_cn' },
  // Off-screen anti-bot honeypot fields: never visible, never localized (bots
  // fill them; translating would change the trap).
  { path: 'src/ui/public/comments/CommentReplyForm.tsx', rules: ['jsx-text', 'jsx-attribute'], text: 'Subtitle' },
  { path: 'src/ui/public/comments/CommentReplyForm.tsx', rules: ['jsx-text', 'jsx-attribute'], text: 'Honeypot' },
  { path: 'src/ui/public/friends/FriendApplyForm.tsx', rules: ['jsx-text', 'jsx-attribute'], text: 'Contact' },
  { path: 'src/ui/public/friends/FriendApplyForm.tsx', rules: ['jsx-text', 'jsx-attribute'], text: 'Honeypot' },
  // `&rarr;` is a decorative arrow glyph in a CTA, not copy.
  { path: 'src/ui/admin/auth/AdminInstallForm.tsx', rules: ['jsx-text'], text: '&rarr;' },
  // "Setup Token" names a server-console credential — a protocol term.
  { path: 'src/ui/admin/auth/SetupTokenVerifyForm.tsx', rules: ['jsx-text'], text: 'Setup Token' },
  // Step 4d: technical tokens that are never translated — SI units, provider
  // names, protocol paths, keyboard keys and example URLs.
  { path: 'src/ui/admin/settings/CommentsForm.tsx', rules: ['jsx-text'], text: 'ms' },
  { path: 'src/ui/admin/settings/GeneralForm.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  { path: 'src/ui/admin/settings/SecurityForm.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  { path: 'src/ui/admin/settings/SecurityForm.tsx', rules: ['jsx-attribute'], text: '/webhook/github' },
  { path: 'src/ui/admin/settings/StorageCards.tsx', rules: ['jsx-text'], text: 'S3 ·' },
  { path: 'src/ui/admin/shell/AdminSearchDialog.tsx', rules: ['jsx-text'], text: 'ESC' },
  { path: 'src/ui/admin/shell/VersionDialog.tsx', rules: ['jsx-text'], text: 'v' },
  { path: 'src/ui/admin/shell/VersionDialog.tsx', rules: ['jsx-text'], text: 'GitHub' },
  // Step 4e: technical tokens on the business admin surface — protocol names,
  // URL prefixes, field identifiers, example URLs and keyboard keys.
  { path: 'src/ui/admin/analytics/LocationsMap.tsx', rules: ['jsx-text'], text: 'IP Geolocation by DB-IP' },
  { path: 'src/ui/admin/analytics/PostAnalyticsView.tsx', rules: ['jsx-text'], text: '/posts/' },
  { path: 'src/ui/admin/categories/CategoryRow.tsx', rules: ['jsx-text'], text: '/cats/' },
  { path: 'src/ui/admin/comments/EditUserDialog.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  { path: 'src/ui/admin/images/ImageDetailDialog.tsx', rules: ['jsx-text'], text: '×' },
  { path: 'src/ui/admin/musics/MusicDetailView.tsx', rules: ['jsx-text'], text: 'playerId' },
  { path: 'src/ui/admin/musics/MusicDetailView.tsx', rules: ['jsx-text'], text: 'sourceId' },
  { path: 'src/ui/admin/my/MyProfileView.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  { path: 'src/ui/admin/shared/SearchShortcutHint.tsx', rules: ['jsx-text'], text: 'Ctrl' },
  { path: 'src/ui/admin/shared/SearchShortcutHint.tsx', rules: ['jsx-text'], text: 'K' },
  { path: 'src/ui/admin/users/UserDetailView.tsx', rules: ['jsx-text'], text: 'Passkey' },
  { path: 'src/ui/admin/users/UserEditForm.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  // Step 4f: the editor slices' technical tokens. `inkling-labels.ts` maps each
  // app locale onto its label table — the tags ARE that mapping's identity. The
  // revision-number sigil and the image-dimension separator are glyphs, not copy.
  { path: 'src/client/editor/inkling-labels.ts', rules: ['hardcoded-locale'] },
  { path: 'src/ui/admin/editor-shell/RevisionsDrawer.tsx', rules: ['jsx-text'], text: 'R' },
  { path: 'src/ui/admin/editor/pickers/ImageLibraryPicker.tsx', rules: ['jsx-text'], text: '×' },
  // Step 5a-iii: technical/developer invariants, never user copy. These files'
  // only DomainError literals are internal diagnostics (a missing meta row, a
  // missing id on a developer-only entry point, registry-default drift), so the
  // rule may be exempted per file.
  { path: 'src/server/domains/content/repos/mutate.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/posts/services/mutate.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/pages/services/mutate.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/settings/sections/registry.ts', rules: ['domain-error'] },
]

function rules(source: string, file = 'fixture.tsx'): string[] {
  return scanSourceForI18nLiterals(source, file).map((violation) => violation.rule)
}

describe('production sources', () => {
  it('carry no hardcoded UI copy inside the migrated roots', () => {
    const result = scanI18nLiterals({ roots: SCAN_ROOTS, allowlist: ALLOWLIST })

    expect(result.scannedFiles.length).toBeGreaterThan(0)
    expect(result.violations).toEqual([])
    // The allowlist is exact: only the tagged rules in the two named files are exempt.
    expect(result.allowlisted.length).toBeGreaterThan(0)
    // Every exemption below is a documented, exact file/rule/snippet entry.
    expect(new Set(result.allowlisted.map((violation) => violation.file))).toEqual(
      new Set([
        'src/shared/i18n/locales.ts',
        'src/shared/i18n/catalog.ts',
        'src/shared/i18n/format.ts',
        'src/ui/public/LikeActions.tsx',
        'src/ui/public/comments/CommentReplyForm.tsx',
        'src/ui/public/friends/FriendApplyForm.tsx',
        'src/ui/admin/auth/AdminInstallForm.tsx',
        'src/ui/admin/auth/SetupTokenVerifyForm.tsx',
        'src/ui/admin/settings/CommentsForm.tsx',
        'src/ui/admin/settings/GeneralForm.tsx',
        'src/ui/admin/settings/SecurityForm.tsx',
        'src/ui/admin/settings/StorageCards.tsx',
        'src/ui/admin/shell/AdminSearchDialog.tsx',
        'src/ui/admin/shell/VersionDialog.tsx',
        'src/ui/admin/analytics/LocationsMap.tsx',
        'src/ui/admin/analytics/PostAnalyticsView.tsx',
        'src/ui/admin/categories/CategoryRow.tsx',
        'src/ui/admin/comments/EditUserDialog.tsx',
        'src/ui/admin/images/ImageDetailDialog.tsx',
        'src/ui/admin/musics/MusicDetailView.tsx',
        'src/ui/admin/my/MyProfileView.tsx',
        'src/ui/admin/shared/SearchShortcutHint.tsx',
        'src/ui/admin/users/UserDetailView.tsx',
        'src/ui/admin/users/UserEditForm.tsx',
        // Step 4f slice: the locale→label-table map and the two glyph sites.
        'src/client/editor/inkling-labels.ts',
        'src/ui/admin/editor-shell/RevisionsDrawer.tsx',
        'src/ui/admin/editor/pickers/ImageLibraryPicker.tsx',
        'src/server/domains/content/repos/mutate.ts',
        'src/server/domains/posts/services/mutate.ts',
        'src/server/domains/pages/services/mutate.ts',
        'src/server/domains/settings/sections/registry.ts',
      ]),
    )
  })

  it('reaches every file under the roots, including nested catalogs', () => {
    const { scannedFiles } = scanI18nLiterals({ roots: SCAN_ROOTS })

    expect(scannedFiles).toContain('src/shared/i18n/locales.ts')
    expect(scannedFiles).toContain('src/shared/i18n/messages/ui/en-US.ts')
    expect(scannedFiles).toContain('src/shared/i18n/messages/server/zh-TW.ts')
    // Step 4b slice: every migrated formatting / registry module is scanned.
    expect(scannedFiles).toEqual(
      expect.arrayContaining([
        'src/shared/config/display.ts',
        'src/shared/cache/registry.ts',
        'src/shared/types/cache.ts',
        'src/shared/utils/roles.ts',
        'src/shared/utils/formatter.ts',
        'src/ui/admin/analytics/time-labels.ts',
        'src/ui/admin/editor-shell/wall-clock.ts',
        'src/ui/admin/settings/cache/cache-formatters.ts',
        'src/ui/admin/tasks/meta.ts',
        'src/ui/shared/notifications/notification-meta.ts',
        // Step 4d slice: the admin shell, settings pages and shared primitives.
        'src/ui/admin/shell/AdminShell.tsx',
        'src/ui/admin/settings/StorageCards.tsx',
        'src/ui/admin/settings/cache/BucketCard.tsx',
        'src/routes/admin/settings/layout.tsx',
        'src/routes/admin/layout.tsx',
        'src/ui/components/pagination.tsx',
        'src/ui/components/combobox.tsx',
        // Step 4f slice: the editor routes, admin editor families and client glue.
        'src/routes/editor/layout.tsx',
        'src/routes/editor/post/analytics.tsx',
        'src/ui/admin/editor/PageBodyEditor.tsx',
        'src/ui/admin/editor-shell/EditorToolbar.tsx',
        'src/ui/admin/editor-shared/BasicInfoCard.tsx',
        'src/client/editor/cards/music-player.tsx',
        'src/client/editor/page-editor-card-config.ts',
        // Step 5a slice: the server error protocol modules.
        'src/server/infra/http/errors.ts',
        'src/server/infra/http/error-descriptor.ts',
        'src/server/http/errors.ts',
        'src/server/http/orpc-base.ts',
        'src/server/http/translate-domain-error.ts',
        // Step 5a-ii slice: auth flows, perimeter middlewares, settings boundaries.
        'src/server/domains/auth/services/credential.ts',
        'src/server/domains/auth/services/password-reset.ts',
        'src/server/domains/auth/services/magic-link.ts',
        'src/server/domains/auth/services/setup.ts',
        'src/server/domains/auth/passkey/service.ts',
        'src/server/domains/auth/session-guard.ts',
        'src/server/domains/auth/schema.ts',
        'src/server/domains/settings/sections/assets.ts',
        'src/server/domains/settings/sections/security.ts',
        'src/server/domains/settings/services/section-patch.ts',
        'src/server/http/middlewares/hono-rbac.ts',
        'src/server/http/middlewares/rate-limit.ts',
        'src/server/http/middlewares/request-timeout.ts',
        'src/server/http/middlewares/csrf.ts',
        'src/server/http/localized-http-exception.ts',
        'src/server/http/controllers/admin/settings.controller.ts',
        // Step 5a-iii slice: settings sections, taxonomies, content lifecycle.
        'src/server/domains/settings/sections/assets.ts',
        'src/server/domains/settings/sections/comments.ts',
        'src/server/domains/settings/sections/security.ts',
        'src/server/domains/settings/sections/backup.ts',
        'src/server/domains/taxonomies/shared.ts',
        'src/server/domains/taxonomies/categories/services/mutate.ts',
        'src/server/domains/content/lifecycle.ts',
        'src/server/domains/content/slug-reclaim.ts',
        'src/server/domains/posts/descriptor.ts',
        'src/server/domains/pages/services/shared.ts',
        'src/server/domains/pt/services/lexical-canonicalize.ts',
        'src/server/infra/slug/resolve.ts',
        'src/server/infra/slug/reservation.ts',
        'src/server/http/controllers/admin/revision-router.ts',
      ]),
    )
  })
})

describe('scanner rules', () => {
  it('flags JSX text but not punctuation or numeric badges', () => {
    expect(rules('export function A() { return <div>保存</div> }')).toEqual(['jsx-text'])
    expect(rules('export function A() { return <div>Hello there</div> }')).toEqual(['jsx-text'])
    expect(rules('export function A() { return <div>404</div> }')).toEqual([])
    expect(rules('export function A() { return <div>{label}</div> }')).toEqual([])
  })

  it('flags copy in JSX expression children', () => {
    expect(rules("export function A() { return <div>{'保存'}</div> }")).toEqual(['jsx-text'])
    expect(rules('export function A() { return <div>{`保存 ${name}`}</div> }')).toEqual(['jsx-text'])
    expect(rules("export function A() { return <div>{ok ? '保存' : '取消'}</div> }")).toEqual(['jsx-text', 'jsx-text'])
    expect(rules("export function A() { return <div>{'保存' + name}</div> }")).toEqual(['jsx-text'])
    expect(rules("export function A() { return <div>{name === 'admin' ? label : name}</div> }")).toEqual([])
    expect(rules('export function A() { return <div>{count}</div> }')).toEqual([])
  })

  it('flags copy-bearing JSX attributes, including the expression form', () => {
    expect(rules('export function A() { return <img alt="封面图" /> }')).toEqual(['jsx-attribute'])
    expect(rules('export function A() { return <input placeholder={`请输入`} /> }')).toEqual(['jsx-attribute'])
    expect(rules('export function A() { return <button aria-label="删除" /> }')).toEqual(['jsx-attribute'])
    // Decorative images and technical class names are not copy.
    expect(rules('export function A() { return <img alt="" className="size-4" /> }')).toEqual([])
  })

  it('flags interpolated attribute copy exactly once (no double report)', () => {
    expect(rules('export function A() { return <img alt={`封面 ${title}`} /> }')).toEqual(['jsx-attribute'])
    expect(rules("export function A() { return <div title={ok ? '保存' : '取消'} /> }")).toEqual([
      'jsx-attribute',
      'jsx-attribute',
    ])
    expect(rules('export function A() { return <div title={copy} /> }')).toEqual([])
  })

  it('accepts only message ids as titleMeta() arguments', () => {
    expect(rules("export const meta = () => titleMeta('登录')")).toEqual(['title-meta'])
    expect(rules('export const meta = () => titleMeta(`登录页`)')).toEqual(['title-meta'])
    expect(rules("export const meta = () => titleMeta('meta.title.auth.signin')")).toEqual([])
    expect(rules('export const meta = () => titleMeta(pageTitle)')).toEqual([])
  })

  it('flags toast messages', () => {
    expect(rules("export function A() { toast.error('设置未保存') }")).toEqual(['toast'])
    expect(rules('export function A() { toast.error(`设置未保存：${reason}`) }')).toEqual(['toast'])
    expect(rules('export function A() { toast.success(message) }')).toEqual([])
  })

  it('flags DomainError user-facing messages', () => {
    expect(rules("export function A() { throw new DomainError('BAD_REQUEST', '设置数据无效') }")).toEqual([
      'domain-error',
    ])
    expect(rules("export function A() { throw new DomainError('BAD_REQUEST', `设置数据无效：${detail}`) }")).toEqual([
      'domain-error',
    ])
    expect(rules("export function A() { throw new DomainError('CONFLICT', reason) }")).toEqual([])
    // English copy is copy: technical text is allowlisted per site later, never
    // exempted by the rule itself.
    expect(rules("export function A() { throw new DomainError('INTERNAL', 'row failed') }")).toEqual(['domain-error'])
    expect(rules("export function A() { throw new DomainError('INTERNAL', String(code)) }")).toEqual([])
  })

  it('flags toLocale*() calls without a meaningful locale', () => {
    expect(rules('export const a = (d: Date) => d.toLocaleDateString()')).toEqual(['to-locale'])
    expect(rules('export const a = (d: Date) => d.toLocaleString(undefined, { hour: "2-digit" })')).toEqual([
      'to-locale',
    ])
    expect(rules('export const a = (d: Date) => d.toLocaleString(void 0, options)')).toEqual(['to-locale'])
    expect(rules('export const a = (d: Date) => d.toLocaleString([], options)')).toEqual(['to-locale'])
    expect(rules("export const a = (d: Date) => d.toLocaleDateString('zh-CN')")).toEqual(['hardcoded-locale'])
    // A real locale argument (variable or literal) is not this rule's target.
    expect(rules('export const a = (d: Date) => d.toLocaleDateString(locale)')).toEqual([])
    expect(rules('export const a = (d: Date) => d.toLocaleDateString(locales, options)')).toEqual([])
  })

  it('flags literals that name a supported locale or one of its aliases', () => {
    expect(rules("export const tag = 'zh-CN'", 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules("export const tag = 'zh-Hant-TW'", 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules("export const tag = 'en'", 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules('export const tag = `zh-CN`', 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules("export const path = '/zh-CN/posts'", 'fixture.ts')).toEqual([])
  })

  it('never treats an interpolated locale template as an exact locale literal', () => {
    expect(rules('export const tag = `zh-${region}`', 'fixture.ts')).toEqual([])
    expect(rules('export const tag = `${base}-CN`', 'fixture.ts')).toEqual([])
  })

  it('reports a stable 1-based line and column', () => {
    const [violation] = scanSourceForI18nLiterals('type A = 1\nexport const tag = "zh-CN"\n', 'fixture.ts')

    expect(violation?.line).toBe(2)
    expect(violation?.column).toBeGreaterThan(1)
  })
})

describe('allowlist', () => {
  const violations = scanSourceForI18nLiterals(
    "export const a = 'zh-CN'\nexport const b = 'zh-TW'\nexport function C() { return <p>保存</p> }\n",
    'src/shared/i18n/sample.tsx',
  )

  it('exempts only the listed rule for a path', () => {
    const result = applyAllowlist(violations, [{ path: 'src/shared/i18n/sample.tsx', rules: ['hardcoded-locale'] }])

    expect(result.allowlisted).toHaveLength(2)
    expect(result.violations.map((violation) => violation.rule)).toEqual(['jsx-text'])
  })

  it('exempts nothing outside the path prefix', () => {
    const result = applyAllowlist(violations, [{ path: 'src/ui/other.tsx' }])

    expect(result.allowlisted).toHaveLength(0)
  })

  it('narrows to an exact snippet when one is given', () => {
    const result = applyAllowlist(violations, [{ path: 'src/shared/i18n', rules: ['hardcoded-locale'], text: 'zh-TW' }])

    expect(result.allowlisted.map((violation) => violation.text)).toEqual(['zh-TW'])
    expect(result.violations).toHaveLength(2)
  })
})
