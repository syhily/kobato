/**
 * Hardcoded-UI-copy guard.
 *
 * Interface copy, validation messages, toast/DomainError text, hardcoded
 * locales and locale-less `toLocale*()` calls must not reach production source:
 * every one of them belongs to the message catalogs so all four locales stay
 * in step. The scanner is an AST walk (see `#/_helpers/i18n-literals`) with an
 * exact file/rule/snippet allowlist — never a blanket directory skip.
 *
 * `SCAN_ROOTS` is the FINAL scope: the whole production tree (`src/**`, one
 * root). Every exemption is an exact file/rule (+ snippet where the file holds
 * more than one finding) entry with a written reason. Whole-file data libraries
 * (the vendored quote bank, the emergency fallback catalog) are not allowlisted
 * at all — they are excluded before the parser runs.
 */

import { describe, expect, it } from 'vitest'

import {
  applyAllowlist,
  scanI18nLiterals,
  scanSourceForI18nLiterals,
  type ScanAllowlistEntry,
} from '#/_helpers/i18n-literals'

// The whole production source tree, one root. An allowlist entry is the only
// way to skip a finding, and it must name the exact file, rule and (usually)
// snippet with a written reason.
const SCAN_ROOTS = ['src'] as const

const ALLOWLIST: readonly ScanAllowlistEntry[] = [
  // The locale module names every supported tag and alias by design — it IS
  // the single source of truth the rule checks against.
  // Endonyms are deliberately each locale's own script, never translated.
  { path: 'src/shared/i18n/locales.ts', rules: ['hardcoded-locale', 'han-literal'] },
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
  // Technical tokens that are never translated — SI units, provider names,
  // protocol paths, keyboard keys and example URLs.
  { path: 'src/ui/admin/settings/CommentsForm.tsx', rules: ['jsx-text'], text: 'ms' },
  { path: 'src/ui/admin/settings/GeneralForm.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  { path: 'src/ui/admin/settings/SecurityForm.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  { path: 'src/ui/admin/settings/SecurityForm.tsx', rules: ['jsx-attribute'], text: '/webhook/github' },
  { path: 'src/ui/admin/settings/StorageCards.tsx', rules: ['jsx-text'], text: 'S3 ·' },
  { path: 'src/ui/admin/shell/AdminSearchDialog.tsx', rules: ['jsx-text'], text: 'ESC' },
  { path: 'src/ui/admin/shell/VersionDialog.tsx', rules: ['jsx-text'], text: 'v' },
  { path: 'src/ui/admin/shell/VersionDialog.tsx', rules: ['jsx-text'], text: 'GitHub' },
  // Technical tokens on the business admin surface — protocol names, URL
  // prefixes, field identifiers, example URLs and keyboard keys.
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
  // The editor slices' technical tokens. The locale→table aggregator
  // keys its map by locale tag — the tags ARE that mapping's identity. The
  // label tables themselves are a copy store (the editor chrome's catalog; the
  // scanner exempts `inkling-labels/` from han-literal by design). The
  // revision-number sigil and the image-dimension separator are glyphs, not copy.
  { path: 'src/shared/i18n/inkling-labels.ts', rules: ['hardcoded-locale'] },
  // The client's dynamic `locale → label-table import` map: the tags are the
  // mapping's identity (the counterpart of the aggregator above), not copy.
  { path: 'src/client/editor/inkling-labels.ts', rules: ['hardcoded-locale'] },
  { path: 'src/ui/admin/editor-shell/RevisionsDrawer.tsx', rules: ['jsx-text'], text: 'R' },
  { path: 'src/ui/admin/editor/pickers/ImageLibraryPicker.tsx', rules: ['jsx-text'], text: '×' },
  // Technical/developer invariants, never user copy. These files'
  // only DomainError literals are internal diagnostics (a missing meta row, a
  // missing id on a developer-only entry point, registry-default drift), so the
  // rule may be exempted per file.
  { path: 'src/server/domains/content/repos/mutate.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/posts/services/mutate.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/pages/services/mutate.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/settings/sections/registry.ts', rules: ['domain-error'] },
  // Webmention verification/fetch failures are TECHNICAL diagnostics persisted
  // as `last_error` (never rendered to a reader) — kept raw by design.
  { path: 'src/server/domains/webmentions/fetch.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/webmentions/receive.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/webmentions/target.ts', rules: ['domain-error'] },
  { path: 'src/server/domains/webmentions/verify.ts', rules: ['domain-error'] },
  // These maps ARE the locale identity (calendar copy / default font
  // chains) — the exact tags are their contract, not UI copy to translate.
  { path: 'src/server/render/calendar/locale.ts', rules: ['hardcoded-locale', 'han-literal'] },
  { path: 'src/shared/config/font-stacks.ts', rules: ['hardcoded-locale'] },
  // Producer guard: both a category AND a tag filter is a programming error,
  // never reachable from the public feed URLs. Technical diagnostic, kept raw.
  {
    path: 'src/server/render/feed/generator.tsx',
    rules: ['domain-error'],
    text: 'Category and tag cannot be specified at the same time',
  },
  // Inkling is a self-contained editor layer: its translatable chrome arrives
  // through the label tables, and these are either glyphs or third-party
  // protocol values.
  { path: 'src/inkling/components/ui/LibrarySelector.tsx', rules: ['jsx-text'], text: '×' },
  { path: 'src/inkling/nodes/FootnoteDefinitionNodeComponent.tsx', rules: ['jsx-text'], text: '×' },
  // Editorial placeholder marker (TK = "to come") — a convention, not copy.
  { path: 'src/inkling/plugins/TKPlugin.tsx', rules: ['jsx-text'], text: 'TK' },
  // emoji-mart's own locale id (third-party picker data), never rendered as copy.
  { path: 'src/inkling/components/ui/EmojiPickerPortal.tsx', rules: ['hardcoded-locale'], text: 'en' },
  // Developer invariants: these DomainError literals guard internal call
  // contracts (a caller passed no role / a projection shape drifted) and never
  // reach a reader. Pinned per SNIPPET — a new user-visible DomainError in the
  // same file must fail this scan instead of riding a file-wide exemption.
  {
    path: 'src/server/domains/auth/primitives.ts',
    rules: ['domain-error'],
    text: 'establishLoginSession requires a user with a role',
  },
  {
    path: 'src/server/domains/settings/services/admin-projection.ts',
    rules: ['domain-error'],
    text: 'admin projection is missing the settings section (…)',
  },
  {
    path: 'src/server/domains/settings/services/admin-projection.ts',
    rules: ['domain-error'],
    text: 'admin projection shape validation failed (…): … …',
  },
  // Transliteration table data: single letters ('Zh', 'zh', 'en', …) are
  // slug-mapping values, not locale choices or copy.
  { path: 'src/shared/slug-char-map.ts', rules: ['hardcoded-locale'] },
  // The SEA Intl probe's expectation table is KEYED by the locale identity — the
  // tags are the probe's index and the expected ICU output is technical data.
  { path: 'src/server/infra/intl-probe.ts', rules: ['hardcoded-locale', 'han-literal'] },
  // CLI stderr/doctor output: operator-facing technical diagnostics, never a
  // browser string (the CLI's Chinese text is deliberate, not a locale bug).
  { path: 'src/server/infra/config.ts', rules: ['han-literal'] },
  { path: 'src/server/infra/binary-rollback.ts', rules: ['han-literal'] },
  // Slash-menu search aliases: match keys, never rendered as interface copy.
  { path: 'src/shared/lexical/cards/menu-matches.ts', rules: ['han-literal'] },
  // Default content seeds and the content projection are spec'd as
  // untranslatable (they are stored/rendered content, not app chrome).
  { path: 'src/shared/lexical/cards/solution.ts', rules: ['han-literal'], text: '解：' },
  {
    path: 'src/shared/lexical/projection-state.ts',
    rules: ['han-literal'],
    text: '🎵 此文章包含音乐播放器，请访问原文收听。',
  },
  { path: 'src/shared/utils/footnotes-section-title.ts', rules: ['han-literal'], text: '尾声礼记' },
  // Social rows seed user-editable content: `brandName` holds the
  // locale-neutral form verbatim; the translated label is `labelId`.
  { path: 'src/shared/config/socials.ts', rules: ['han-literal'], text: '微博' },
  { path: 'src/shared/config/socials.ts', rules: ['han-literal'], text: '微信' },
]

function rules(source: string, file = 'fixture.tsx'): string[] {
  return scanSourceForI18nLiterals(source, file).map((violation) => violation.rule)
}

// Parsing the whole tree is the expensive part; both full-tree assertions read
// the SAME result (the second only needs `scannedFiles`).
let productionScan: ReturnType<typeof scanI18nLiterals> | null = null
function scanProduction(): ReturnType<typeof scanI18nLiterals> {
  productionScan ??= scanI18nLiterals({ roots: SCAN_ROOTS, allowlist: ALLOWLIST })
  return productionScan
}

describe('production sources', () => {
  it('carry no hardcoded UI copy anywhere in the production tree', { timeout: 300_000 }, () => {
    const result = scanProduction()

    expect(result.scannedFiles.length).toBeGreaterThan(0)
    // Every rule, `han-literal` included, covers the whole production tree;
    // the only escapes are the exact entries below.
    expect(result.violations).toEqual([])
    // The allowlist is exact: each entry names the file, the rule and (where a
    // file carries several findings) the exact snippet — see ALLOWLIST.
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
        // The locale→label-table maps and the two glyph sites.
        'src/shared/i18n/inkling-labels.ts',
        'src/client/editor/inkling-labels.ts',
        'src/ui/admin/editor-shell/RevisionsDrawer.tsx',
        'src/ui/admin/editor/pickers/ImageLibraryPicker.tsx',
        'src/server/domains/content/repos/mutate.ts',
        'src/server/domains/posts/services/mutate.ts',
        'src/server/domains/pages/services/mutate.ts',
        'src/server/domains/settings/sections/registry.ts',
        'src/server/domains/webmentions/fetch.ts',
        'src/server/domains/webmentions/receive.ts',
        'src/server/domains/webmentions/target.ts',
        'src/server/domains/webmentions/verify.ts',
        // Locale-keyed static maps and the feed producer guard.
        'src/server/render/calendar/locale.ts',
        'src/shared/config/font-stacks.ts',
        'src/server/render/feed/generator.tsx',
        'src/inkling/components/ui/LibrarySelector.tsx',
        'src/inkling/nodes/FootnoteDefinitionNodeComponent.tsx',
        'src/inkling/plugins/TKPlugin.tsx',
        'src/inkling/components/ui/EmojiPickerPortal.tsx',
        'src/server/domains/auth/primitives.ts',
        'src/server/domains/settings/services/admin-projection.ts',
        'src/shared/slug-char-map.ts',
        'src/server/infra/intl-probe.ts',
        'src/server/infra/config.ts',
        'src/server/infra/binary-rollback.ts',
        'src/shared/lexical/cards/menu-matches.ts',
        'src/shared/lexical/cards/solution.ts',
        'src/shared/lexical/projection-state.ts',
        'src/shared/utils/footnotes-section-title.ts',
        'src/shared/config/socials.ts',
      ]),
    )
  })

  it('excludes whole-file content libraries before reading or parsing them', () => {
    const { skippedFiles, scannedFiles } = scanProduction()

    // The vendored quote bank and the emergency fallback catalog are data, not
    // chrome: they are reached under the roots but never parsed, so neither
    // needs an allowlist entry.
    expect(skippedFiles).toEqual(['src/server/render/calendar/local-quotes.ts', 'src/shared/i18n/fallback-messages.ts'])
    // Skipped means not scanned: the quote bank never reaches the parser, so
    // its thousands of quotes need no allowlist exemption either.
    expect(scannedFiles).not.toContain('src/server/render/calendar/local-quotes.ts')
    expect(scannedFiles).not.toContain('src/shared/i18n/fallback-messages.ts')
  })

  it('reaches every file under the roots, including nested catalogs', { timeout: 120_000 }, () => {
    const { scannedFiles } = scanProduction()

    expect(scannedFiles).toContain('src/shared/i18n/locales.ts')
    expect(scannedFiles).toContain('src/shared/i18n/messages/ui/en-US.ts')
    expect(scannedFiles).toContain('src/shared/i18n/messages/server/zh-TW.ts')
    // Formatting and registry modules.
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
        // The admin shell, settings pages and shared primitives.
        'src/ui/admin/shell/AdminShell.tsx',
        'src/ui/admin/settings/StorageCards.tsx',
        'src/ui/admin/settings/cache/BucketCard.tsx',
        'src/routes/admin/settings/layout.tsx',
        'src/routes/admin/layout.tsx',
        'src/ui/components/pagination.tsx',
        'src/ui/components/combobox.tsx',
        // The editor routes, admin editor families and client glue.
        'src/routes/editor/layout.tsx',
        'src/routes/editor/post/analytics.tsx',
        'src/ui/admin/editor/PageBodyEditor.tsx',
        'src/ui/admin/editor-shell/EditorToolbar.tsx',
        'src/ui/admin/editor-shared/BasicInfoCard.tsx',
        'src/client/editor/cards/music-player.tsx',
        'src/client/editor/page-editor-card-config.ts',
        // The server error protocol modules.
        'src/server/infra/http/errors.ts',
        'src/server/infra/http/error-descriptor.ts',
        'src/server/http/errors.ts',
        'src/server/http/orpc-base.ts',
        'src/server/http/translate-domain-error.ts',
        // Auth flows, perimeter middlewares, settings boundaries.
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
        // Settings sections, taxonomies, content lifecycle.
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
        // Comments and webmentions.
        'src/server/domains/comments/services/moderate.ts',
        'src/server/domains/comments/services/policy.ts',
        'src/server/domains/webmentions/reverify.ts',
        'src/server/http/controllers/comments-public.controller.ts',
        'src/server/http/controllers/admin/webmentions.controller.ts',
        // Backup/restore validation and the password flow.
        'src/server/domains/backup/services/restore.ts',
        'src/server/domains/backup/services/backup.ts',
        'src/server/domains/backup/pending-uploads.ts',
        'src/server/http/resources/backup.ts',
        'src/server/http/controllers/admin/backup.controller.ts',
        // Asset domains (storage, images, music, fonts) and the worker wire.
        'src/server/domains/storage/s3-migration.ts',
        'src/server/domains/images/services/upload.ts',
        'src/server/domains/images/key.ts',
        'src/server/domains/music/services/write/shared.ts',
        'src/server/domains/fonts/services/upload.ts',
        'src/server/domains/assets/services/storage.ts',
        'src/server/infra/storage/backends/s3.ts',
        'src/server/infra/image/process-worker.ts',
        'src/server/http/resources/storage-redirect.ts',
        'src/server/http/resources/admin-upload-route.ts',
        'src/server/http/controllers/admin/images.controller.ts',
        // Users, friends, newsletter, notifications, update, audit.
        'src/server/domains/users/services/admin.ts',
        'src/server/domains/users/services/account.ts',
        'src/server/domains/friends/service.ts',
        'src/server/domains/friends/schema.ts',
        'src/server/domains/newsletter/service.ts',
        'src/server/domains/notifications/service.ts',
        'src/server/domains/update/service.ts',
        'src/server/domains/update/job.ts',
        'src/server/http/controllers/likes.controller.ts',
        'src/server/http/controllers/admin/audit.controller.ts',
        'src/server/http/controllers/admin/users-admin.controller.ts',
        'src/server/http/loaders/search.ts',
        // GeoIP updates, the self-update pipeline, safe-url ids.
        'src/server/domains/analytics/geoip-update.ts',
        'src/server/domains/update/pipeline.ts',
        'src/shared/utils/safe-url.ts',
        // The Gravatar mirror preset labels render through `t()`.
        'src/ui/admin/settings/CommentsForm.tsx',
        // Email templates/senders render server-catalog copy.
        'src/server/infra/email/sender.ts',
        'src/server/infra/email/templates/layout/EmailLayout.tsx',
        'src/server/infra/email/templates/AdminNotificationEmail.tsx',
        'src/server/infra/email/templates/NewReply.tsx',
        'src/server/domains/comments/services/email.ts',
        'src/server/domains/friends/email.ts',
        'src/server/domains/newsletter/email.ts',
        'src/server/domains/notifications/email.ts',
        'src/server/domains/webmentions/email.ts',
        // The notification descriptor resolver and producers.
        'src/server/domains/notifications/message.ts',
        'src/server/domains/notifications/email.ts',
        'src/server/domains/notifications/service.ts',
        'src/server/bootstrap/db-lifecycle.ts',
        'src/server/domains/settings/services/zeabur-mail-cleanup.ts',
        // Localized feed/calendar/manifest and locale font chains.
        'src/server/render/feed/generator.tsx',
        'src/server/render/calendar/render.ts',
        'src/server/render/calendar/locale.ts',
        'src/server/http/resources/feed.ts',
        'src/server/http/resources/calendar.ts',
        'src/server/http/resources/images.ts',
        'src/server/http/resources/assets.ts',
        'src/server/http/middleware-pipeline.ts',
        'src/shared/config/font-stacks.ts',
        'src/entry.server.tsx',
        'src/root.tsx',
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
    // English copy is copy: technical text is allowlisted per site, never
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

  it('reports the exact line and column of every hit', () => {
    const source = [
      'type A = 1',
      '',
      'export const tag = "zh-CN"', // opening quote at column 20
      'export const other = `zh-TW`', // opening backtick at column 22
      "'zh-HK'", // a hit at the very start of a line
      '',
      'export function C() {',
      '  return <p>保存</p>', // JSX text at column 13
      '}',
    ].join('\n')

    expect(scanSourceForI18nLiterals(source, 'fixture.tsx')).toEqual([
      { rule: 'hardcoded-locale', file: 'fixture.tsx', line: 3, column: 20, text: 'zh-CN' },
      { rule: 'hardcoded-locale', file: 'fixture.tsx', line: 4, column: 22, text: 'zh-TW' },
      { rule: 'hardcoded-locale', file: 'fixture.tsx', line: 5, column: 1, text: 'zh-HK' },
      { rule: 'jsx-text', file: 'fixture.tsx', line: 8, column: 13, text: '保存' },
    ])
  })

  it('skips a content store before the parser sees it', () => {
    // Invalid syntax would throw in `parseAst`; a content store must never
    // reach it, so the same text is silently (and deliberately) not scanned.
    const invalid = 'this is not valid TypeScript {{{'
    expect(() => scanSourceForI18nLiterals(invalid, 'src/not-a-content-store.ts')).toThrow()
    expect(scanSourceForI18nLiterals(invalid, 'src/server/render/calendar/local-quotes.ts')).toEqual([])
    expect(scanSourceForI18nLiterals(invalid, 'src/shared/i18n/fallback-messages.ts')).toEqual([])
  })

  // No wall-clock assertion: the fixture is big enough (thousands of hits late
  // in a multi-megabyte file) that a per-hit rescan from offset 0 would be
  // quadratic and time out; the binary-searched line index stays linear.
  // Correctness of every position is asserted instead.
  it('stays fast on a large file with thousands of late hits', { timeout: 60_000 }, () => {
    const lineCount = 10_000
    const padding = 'x'.repeat(180)
    const lines = Array.from({ length: lineCount }, (_, index) => `export const v${index} = 'en' // ${padding}`)
    const violations = scanSourceForI18nLiterals(lines.join('\n'), 'fixture.ts')

    expect(violations).toHaveLength(lineCount)
    for (const index of [0, 1, lineCount / 2, lineCount - 1]) {
      expect(violations[index]).toEqual({
        rule: 'hardcoded-locale',
        file: 'fixture.ts',
        line: index + 1,
        column: lines[index].indexOf("'en'") + 1,
        text: 'en',
      })
    }
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
