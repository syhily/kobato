/**
 * Hardcoded-UI-copy guard.
 *
 * Interface copy, validation messages, toast/DomainError text, hardcoded
 * locales and locale-less `toLocale*()` calls must not reach production source:
 * every one of them belongs to the message catalogs so all four locales stay
 * in step. The scanner is an AST walk (see `#/_helpers/i18n-literals`) with an
 * exact file/rule/snippet allowlist — never a blanket directory skip.
 *
 * `SCAN_ROOTS` is the FINAL scope: the whole production tree (every package's
 * `src/**`). Every exemption is an exact file/rule (+ snippet where the file
 * holds more than one finding) entry with a written reason. Whole-file data
 * libraries (the vendored quote bank, the emergency fallback catalog) are not
 * allowlisted at all — they are excluded before the parser runs.
 */

import {
  applyAllowlist,
  scanI18nLiterals,
  scanSourceForI18nLiterals,
  type ScanAllowlistEntry,
} from '@kobato/test/i18n-literals.ts'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The whole production source tree across the workspace packages, including
// the shared split's leaf roots as their sources land. An allowlist
// entry is the only way to skip a finding, and it must name the exact file,
// rule and (usually) snippet with a written reason.
const SCAN_ROOTS = [
  'apps/kobato/src',
  'packages/inkling/src',
  'packages/db/src',
  'packages/server/src',
  'packages/shared/contracts/src',
  'packages/shared/auth/src',
  'packages/shared/catalog/src',
  'packages/shared/telemetry/src',
  'packages/shared/distribution/src',
  'packages/shared/seo/src',
  'packages/shared/lexical/src',
  'packages/shared/utils/src',
  'packages/shared/i18n/src',
  'packages/shared/cache/src',
  'packages/shared/settings/src',
  'packages/shared/assets/src',
  'packages/shared/sanitize/src',
  'packages/ui/src',
  'packages/web/admin/src',
  'packages/web/client/src',
  'packages/web/public/src',
] as const

const ALLOWLIST: readonly ScanAllowlistEntry[] = [
  // The locale module names every supported tag and alias by design — it IS
  // the single source of truth the rule checks against.
  // Endonyms are deliberately each locale's own script, never translated.
  { path: 'packages/shared/i18n/src/locales.ts', rules: ['hardcoded-locale', 'han-literal'] },
  // The catalog aggregator keys its per-locale maps and its English fallback
  // by tag; those literals are the catalog identity, not UI copy.
  { path: 'packages/shared/i18n/src/catalog.ts', rules: ['hardcoded-locale'] },
  // The display facade maps app locales onto date-fns locales — same identity role.
  { path: 'packages/shared/utils/src/format.ts', rules: ['hardcoded-locale'] },
  // Weibo's share widget takes a hardcoded `language=zh_cn` PROTOCOL parameter;
  // it is never rendered to a reader.
  { path: 'packages/web/public/src/ui/LikeActions.tsx', rules: ['hardcoded-locale'], text: 'zh_cn' },
  // Off-screen anti-bot honeypot fields: never visible, never localized (bots
  // fill them; translating would change the trap).
  {
    path: 'packages/web/public/src/ui/comments/CommentReplyForm.tsx',
    rules: ['jsx-text', 'jsx-attribute'],
    text: 'Subtitle',
  },
  {
    path: 'packages/web/public/src/ui/comments/CommentReplyForm.tsx',
    rules: ['jsx-text', 'jsx-attribute'],
    text: 'Honeypot',
  },
  {
    path: 'packages/web/public/src/ui/friends/FriendApplyForm.tsx',
    rules: ['jsx-text', 'jsx-attribute'],
    text: 'Contact',
  },
  {
    path: 'packages/web/public/src/ui/friends/FriendApplyForm.tsx',
    rules: ['jsx-text', 'jsx-attribute'],
    text: 'Honeypot',
  },
  // `&rarr;` is a decorative arrow glyph in a CTA, not copy.
  { path: 'packages/web/admin/src/ui/auth/AdminInstallForm.tsx', rules: ['jsx-text'], text: '&rarr;' },
  // "Setup Token" names a server-console credential — a protocol term.
  { path: 'packages/web/admin/src/ui/auth/SetupTokenVerifyForm.tsx', rules: ['jsx-text'], text: 'Setup Token' },
  // Technical tokens that are never translated — SI units, provider names,
  // protocol paths, keyboard keys and example URLs.
  {
    path: 'packages/web/admin/src/ui/settings/comments/CommentsAvatarCard.tsx',
    rules: ['jsx-text'],
    text: 'ms',
  },
  {
    path: 'packages/web/admin/src/ui/settings/general/GeneralIdentityCard.tsx',
    rules: ['jsx-attribute'],
    text: 'https://example.com',
  },
  {
    path: 'packages/web/admin/src/ui/settings/general/GeneralAuthorCard.tsx',
    rules: ['jsx-attribute'],
    text: 'https://example.com',
  },
  {
    path: 'packages/web/admin/src/ui/settings/security/CorsPolicyCard.tsx',
    rules: ['jsx-attribute'],
    text: 'https://example.com',
  },
  {
    path: 'packages/web/admin/src/ui/settings/security/CsrfExemptPathsCard.tsx',
    rules: ['jsx-attribute'],
    text: '/webhook/github',
  },
  { path: 'packages/web/admin/src/ui/settings/storage/StorageCards.tsx', rules: ['jsx-text'], text: 'S3 ·' },
  { path: 'packages/web/admin/src/ui/shell/AdminSearchDialog.tsx', rules: ['jsx-text'], text: 'ESC' },
  { path: 'packages/web/admin/src/ui/shell/VersionDialog.tsx', rules: ['jsx-text'], text: 'v' },
  { path: 'packages/web/admin/src/ui/shell/VersionDialog.tsx', rules: ['jsx-text'], text: 'GitHub' },
  // Technical tokens on the business admin surface — protocol names, URL
  // prefixes, field identifiers, example URLs and keyboard keys.
  {
    path: 'packages/web/admin/src/ui/analytics/LocationsMap.tsx',
    rules: ['jsx-text'],
    text: 'IP Geolocation by DB-IP',
  },
  { path: 'packages/web/admin/src/ui/analytics/PostAnalyticsView.tsx', rules: ['jsx-text'], text: '/posts/' },
  { path: 'packages/web/admin/src/ui/categories/CategoryRow.tsx', rules: ['jsx-text'], text: '/cats/' },
  {
    path: 'packages/web/admin/src/ui/comments/EditUserDialog.tsx',
    rules: ['jsx-attribute'],
    text: 'https://example.com',
  },
  { path: 'packages/web/admin/src/ui/images/ImageDetailDialog.tsx', rules: ['jsx-text'], text: '×' },
  { path: 'packages/web/admin/src/ui/music/MusicDetailView.tsx', rules: ['jsx-text'], text: 'playerId' },
  { path: 'packages/web/admin/src/ui/music/MusicDetailView.tsx', rules: ['jsx-text'], text: 'sourceId' },
  {
    path: 'packages/web/admin/src/ui/account/MyProfileView.tsx',
    rules: ['jsx-attribute'],
    text: 'https://example.com',
  },
  { path: 'packages/web/admin/src/ui/shared/SearchShortcutHint.tsx', rules: ['jsx-text'], text: 'Ctrl' },
  { path: 'packages/web/admin/src/ui/shared/SearchShortcutHint.tsx', rules: ['jsx-text'], text: 'K' },
  { path: 'packages/web/admin/src/ui/users/UserDetailView.tsx', rules: ['jsx-text'], text: 'Passkey' },
  { path: 'packages/web/admin/src/ui/users/UserEditForm.tsx', rules: ['jsx-attribute'], text: 'https://example.com' },
  // The editor slices' technical tokens. The locale→table aggregator
  // keys its map by locale tag — the tags ARE that mapping's identity. The
  // label tables themselves are a copy store (the editor chrome's catalog; the
  // scanner exempts `inkling-labels/` from han-literal by design). The
  // revision-number sigil and the image-dimension separator are glyphs, not copy.
  { path: 'packages/shared/i18n/src/inkling-labels.ts', rules: ['hardcoded-locale'] },
  // The client's dynamic `locale → label-table import` map: the tags are the
  // mapping's identity (the counterpart of the aggregator above), not copy.
  { path: 'packages/web/client/src/editor/inkling-labels.ts', rules: ['hardcoded-locale'] },
  { path: 'packages/web/admin/src/ui/editor-shell/RevisionsDrawer.tsx', rules: ['jsx-text'], text: 'R' },
  { path: 'packages/web/admin/src/ui/editor/pickers/ImageLibraryPicker.tsx', rules: ['jsx-text'], text: '×' },
  // Technical/developer invariants, never user copy. These files'
  // only DomainError literals are internal diagnostics (a missing meta row, a
  // missing id on a developer-only entry point, registry-default drift), so the
  // rule may be exempted per file.
  { path: 'packages/server/src/domains/content/repos/mutate.ts', rules: ['domain-error'] },
  { path: 'packages/server/src/domains/posts/services/mutate.ts', rules: ['domain-error'] },
  { path: 'packages/server/src/domains/pages/services/mutate.ts', rules: ['domain-error'] },
  { path: 'packages/server/src/domains/settings/sections/registry.ts', rules: ['domain-error'] },
  // Webmention verification/fetch failures are TECHNICAL diagnostics persisted
  // as `last_error` (never rendered to a reader) — kept raw by design.
  { path: 'packages/server/src/domains/webmentions/fetch.ts', rules: ['domain-error'] },
  { path: 'packages/server/src/domains/webmentions/receive.ts', rules: ['domain-error'] },
  { path: 'packages/server/src/domains/webmentions/target.ts', rules: ['domain-error'] },
  { path: 'packages/server/src/domains/webmentions/verify.ts', rules: ['domain-error'] },
  // These maps ARE the locale identity (calendar copy / default font
  // chains) — the exact tags are their contract, not UI copy to translate.
  { path: 'packages/server/src/render/calendar/locale.ts', rules: ['hardcoded-locale', 'han-literal'] },
  { path: 'packages/ui/src/lib/font-stacks.ts', rules: ['hardcoded-locale'] },
  // Producer guard: both a category AND a tag filter is a programming error,
  // never reachable from the public feed URLs. Technical diagnostic, kept raw.
  {
    path: 'packages/server/src/render/feed/generator.tsx',
    rules: ['domain-error'],
    text: 'Category and tag cannot be specified at the same time',
  },
  // Inkling is a self-contained editor layer: its translatable chrome arrives
  // through the label tables, and these are either glyphs or third-party
  // protocol values.
  { path: 'packages/inkling/src/components/ui/LibrarySelector.tsx', rules: ['jsx-text'], text: '×' },
  { path: 'packages/inkling/src/nodes/FootnoteDefinitionNodeComponent.tsx', rules: ['jsx-text'], text: '×' },
  // Editorial placeholder marker (TK = "to come") — a convention, not copy.
  { path: 'packages/inkling/src/plugins/TKPlugin.tsx', rules: ['jsx-text'], text: 'TK' },
  // emoji-mart's own locale id (third-party picker data), never rendered as copy.
  { path: 'packages/inkling/src/components/ui/EmojiPickerPortal.tsx', rules: ['hardcoded-locale'], text: 'en' },
  // Developer invariants: these DomainError literals guard internal call
  // contracts (a caller passed no role / a projection shape drifted) and never
  // reach a reader. Pinned per SNIPPET — a new user-visible DomainError in the
  // same file must fail this scan instead of riding a file-wide exemption.
  {
    path: 'packages/server/src/domains/auth/primitives.ts',
    rules: ['domain-error'],
    text: 'establishLoginSession requires a user with a role',
  },
  {
    path: 'packages/server/src/domains/settings/services/admin-projection.ts',
    rules: ['domain-error'],
    text: 'admin projection is missing the settings section (…)',
  },
  {
    path: 'packages/server/src/domains/settings/services/admin-projection.ts',
    rules: ['domain-error'],
    text: 'admin projection shape validation failed (…): … …',
  },
  // Transliteration table data: single letters ('Zh', 'zh', 'en', …) are
  // slug-mapping values, not locale choices or copy.
  { path: 'packages/shared/utils/src/slug-char-map.ts', rules: ['hardcoded-locale'] },
  // The SEA Intl probe's expectation table is KEYED by the locale identity — the
  // tags are the probe's index and the expected ICU output is technical data.
  { path: 'packages/server/src/infra/sea/intl-probe.ts', rules: ['hardcoded-locale', 'han-literal'] },
  // CLI stderr/doctor output: operator-facing technical diagnostics, never a
  // browser string (the CLI's Chinese text is deliberate, not a locale bug).
  { path: 'packages/server/src/infra/config.ts', rules: ['han-literal'] },
  { path: 'packages/server/src/infra/sea/binary-rollback.ts', rules: ['han-literal'] },
  // Slash-menu search aliases: match keys, never rendered as interface copy.
  { path: 'packages/web/admin/src/ui/editor/cards/menu-matches.ts', rules: ['han-literal'] },
  // Default content seeds and the content projection are spec'd as
  // untranslatable (they are stored/rendered content, not app chrome).
  { path: 'packages/shared/lexical/src/cards/solution.ts', rules: ['han-literal'], text: '解：' },
  {
    path: 'packages/shared/lexical/src/projection-state.ts',
    rules: ['han-literal'],
    text: '🎵 此文章包含音乐播放器，请访问原文收听。',
  },
  { path: 'packages/shared/settings/src/presentation.ts', rules: ['han-literal'], text: '尾声礼记' },
  // Social rows seed user-editable content: `brandName` holds the
  // locale-neutral form verbatim; the translated label is `labelId`.
  { path: 'packages/shared/settings/src/socials.ts', rules: ['han-literal'], text: '微博' },
  { path: 'packages/shared/settings/src/socials.ts', rules: ['han-literal'], text: '微信' },
]

function rules(source: string, file = 'fixture.tsx'): string[] {
  return scanSourceForI18nLiterals(source, file).map((violation) => violation.rule)
}

// Parsing the whole tree is the expensive part; both full-tree assertions read
// the SAME result (the second only needs `scannedFiles`). Roots whose split has
// not started yet may not exist on disk — the scanner deliberately throws on a
// missing root (a silent skip would mask typos), so they are filtered here.
let productionScan: ReturnType<typeof scanI18nLiterals> | null = null
function scanProduction(): ReturnType<typeof scanI18nLiterals> {
  productionScan ??= scanI18nLiterals({
    roots: SCAN_ROOTS.filter((root) => existsSync(root)),
    allowlist: ALLOWLIST,
  })
  return productionScan
}

describe('production sources', () => {
  it('carry no hardcoded UI copy anywhere in the production tree', { timeout: 300_000 }, () => {
    const result = scanProduction()

    expect(result.scannedFiles.length).toBeGreaterThan(0)
    expect(result.violations).toEqual([])

    expect(result.allowlisted.length).toBeGreaterThan(0)
    expect(new Set(result.allowlisted.map((violation) => violation.file))).toEqual(
      new Set([
        'packages/shared/i18n/src/locales.ts',
        'packages/shared/i18n/src/catalog.ts',
        'packages/shared/utils/src/format.ts',
        'packages/web/public/src/ui/LikeActions.tsx',
        'packages/web/public/src/ui/comments/CommentReplyForm.tsx',
        'packages/web/public/src/ui/friends/FriendApplyForm.tsx',
        'packages/web/admin/src/ui/auth/AdminInstallForm.tsx',
        'packages/web/admin/src/ui/auth/SetupTokenVerifyForm.tsx',
        'packages/web/admin/src/ui/settings/comments/CommentsAvatarCard.tsx',
        'packages/web/admin/src/ui/settings/general/GeneralIdentityCard.tsx',
        'packages/web/admin/src/ui/settings/general/GeneralAuthorCard.tsx',
        'packages/web/admin/src/ui/settings/security/CorsPolicyCard.tsx',
        'packages/web/admin/src/ui/settings/security/CsrfExemptPathsCard.tsx',
        'packages/web/admin/src/ui/settings/storage/StorageCards.tsx',
        'packages/web/admin/src/ui/shell/AdminSearchDialog.tsx',
        'packages/web/admin/src/ui/shell/VersionDialog.tsx',
        'packages/web/admin/src/ui/analytics/LocationsMap.tsx',
        'packages/web/admin/src/ui/analytics/PostAnalyticsView.tsx',
        'packages/web/admin/src/ui/categories/CategoryRow.tsx',
        'packages/web/admin/src/ui/comments/EditUserDialog.tsx',
        'packages/web/admin/src/ui/images/ImageDetailDialog.tsx',
        'packages/web/admin/src/ui/music/MusicDetailView.tsx',
        'packages/web/admin/src/ui/account/MyProfileView.tsx',
        'packages/web/admin/src/ui/shared/SearchShortcutHint.tsx',
        'packages/web/admin/src/ui/users/UserDetailView.tsx',
        'packages/web/admin/src/ui/users/UserEditForm.tsx',

        'packages/shared/i18n/src/inkling-labels.ts',
        'packages/web/client/src/editor/inkling-labels.ts',
        'packages/web/admin/src/ui/editor-shell/RevisionsDrawer.tsx',
        'packages/web/admin/src/ui/editor/pickers/ImageLibraryPicker.tsx',
        'packages/server/src/domains/content/repos/mutate.ts',
        'packages/server/src/domains/posts/services/mutate.ts',
        'packages/server/src/domains/pages/services/mutate.ts',
        'packages/server/src/domains/settings/sections/registry.ts',
        'packages/server/src/domains/webmentions/fetch.ts',
        'packages/server/src/domains/webmentions/receive.ts',
        'packages/server/src/domains/webmentions/target.ts',
        'packages/server/src/domains/webmentions/verify.ts',

        'packages/server/src/render/calendar/locale.ts',
        'packages/ui/src/lib/font-stacks.ts',
        'packages/server/src/render/feed/generator.tsx',
        'packages/inkling/src/components/ui/LibrarySelector.tsx',
        'packages/inkling/src/nodes/FootnoteDefinitionNodeComponent.tsx',
        'packages/inkling/src/plugins/TKPlugin.tsx',
        'packages/inkling/src/components/ui/EmojiPickerPortal.tsx',
        'packages/server/src/domains/auth/primitives.ts',
        'packages/server/src/domains/settings/services/admin-projection.ts',
        'packages/shared/utils/src/slug-char-map.ts',
        'packages/server/src/infra/sea/intl-probe.ts',
        'packages/server/src/infra/config.ts',
        'packages/server/src/infra/sea/binary-rollback.ts',
        'packages/web/admin/src/ui/editor/cards/menu-matches.ts',
        'packages/shared/lexical/src/cards/solution.ts',
        'packages/shared/lexical/src/projection-state.ts',
        'packages/shared/settings/src/presentation.ts',
        'packages/shared/settings/src/socials.ts',
      ]),
    )
  })

  it('excludes whole-file content libraries before reading or parsing them', () => {
    const { skippedFiles, scannedFiles } = scanProduction()

    // The emergency fallback catalog is data, not chrome: it is reached under
    // the roots but never parsed, so it needs no allowlist entry. The calendar
    // quote bank is now a JSON data file, so its tiny typed wrapper IS scanned.
    expect(skippedFiles).toEqual(['packages/shared/i18n/src/fallback-messages.ts'])
    expect(scannedFiles).toContain('packages/server/src/render/calendar/local-quotes.ts')
    expect(scannedFiles).not.toContain('packages/shared/i18n/src/fallback-messages.ts')
  })

  it('reaches every file under the roots, including nested catalogs', { timeout: 120_000 }, () => {
    const { scannedFiles } = scanProduction()

    expect(scannedFiles).toContain('packages/shared/i18n/src/locales.ts')
    expect(scannedFiles).toContain('packages/shared/i18n/src/messages/ui/en-US.ts')
    expect(scannedFiles).toContain('packages/shared/i18n/src/messages/server/zh-TW.ts')

    expect(scannedFiles).toEqual(
      expect.arrayContaining([
        'packages/web/admin/src/ui/settings/display.ts',
        'packages/shared/cache/src/registry.ts',
        'packages/shared/cache/src/types.ts',
        'packages/shared/auth/src/roles.ts',
        'packages/shared/utils/src/site-date.ts',
        'packages/web/admin/src/ui/analytics/time-labels.ts',
        'packages/web/admin/src/ui/editor-shell/wall-clock.ts',
        'packages/web/admin/src/ui/settings/cache/cache-formatters.ts',
        'packages/web/admin/src/ui/jobs/meta.ts',
        'packages/web/public/src/ui/shared/notifications/notification-meta.ts',

        'packages/web/admin/src/ui/shell/AdminShell.tsx',
        'packages/web/admin/src/ui/settings/storage/StorageCards.tsx',
        'packages/web/admin/src/ui/settings/cache/BucketCard.tsx',
        'apps/kobato/src/routes/admin/settings/layout.tsx',
        'apps/kobato/src/routes/admin/layout.tsx',
        'packages/ui/src/components/pagination.tsx',
        'packages/ui/src/components/combobox.tsx',

        'apps/kobato/src/routes/editor/layout.tsx',
        'apps/kobato/src/routes/editor/post/analytics.tsx',
        'packages/web/admin/src/ui/editor/PageBodyEditor.tsx',
        'packages/web/admin/src/ui/editor-shell/EditorToolbar.tsx',
        'packages/web/admin/src/ui/editor-meta/BasicInfoCard.tsx',
        'packages/web/admin/src/ui/editor/cards/music-player.tsx',
        'packages/web/admin/src/ui/editor/page-editor-card-config.ts',

        'packages/server/src/infra/http/errors.ts',
        'packages/server/src/infra/http/error-descriptor.ts',
        'packages/server/src/http/errors.ts',
        'packages/server/src/http/orpc-base.ts',
        'packages/server/src/http/translate-domain-error.ts',

        'packages/server/src/domains/auth/services/credential.ts',
        'packages/server/src/domains/auth/services/password-reset.ts',
        'packages/server/src/domains/auth/services/magic-link.ts',
        'packages/server/src/domains/auth/services/setup.ts',
        'packages/server/src/domains/auth/passkey/service.ts',
        'packages/server/src/domains/auth/session-guard.ts',
        'packages/server/src/domains/auth/schema.ts',
        'packages/shared/settings/src/sections/assets.ts',
        'packages/shared/settings/src/sections/security.ts',
        'packages/server/src/domains/settings/services/section-patch.ts',
        'packages/server/src/http/middlewares/hono-rbac.ts',
        'packages/server/src/http/middlewares/rate-limit.ts',
        'packages/server/src/http/middlewares/request-timeout.ts',
        'packages/server/src/http/middlewares/csrf.ts',
        'packages/server/src/http/localized-http-exception.ts',
        'packages/server/src/http/controllers/admin/settings.controller.ts',

        'packages/shared/settings/src/sections/assets.ts',
        'packages/shared/settings/src/sections/comments.ts',
        'packages/shared/settings/src/sections/security.ts',
        'packages/shared/settings/src/sections/backup.ts',
        'packages/server/src/domains/taxonomies/shared.ts',
        'packages/server/src/domains/taxonomies/categories/services/mutate.ts',
        'packages/server/src/domains/content/lifecycle.ts',
        'packages/server/src/domains/content/slug-reclaim.ts',
        'packages/server/src/domains/posts/descriptor.ts',
        'packages/server/src/domains/pages/services/shared.ts',
        'packages/server/src/domains/content/services/lexical/canonicalize.ts',
        'packages/server/src/infra/slug/resolve.ts',
        'packages/server/src/infra/slug/reservation.ts',
        'packages/server/src/http/controllers/admin/revision-shared.ts',

        'packages/server/src/domains/comments/services/moderate.ts',
        'packages/server/src/domains/comments/services/policy.ts',
        'packages/server/src/domains/webmentions/reverify.ts',
        'packages/server/src/http/controllers/comments-public.controller.ts',
        'packages/server/src/http/controllers/admin/webmentions.controller.ts',

        'packages/server/src/domains/backup/services/restore.ts',
        'packages/server/src/domains/backup/services/backup.ts',
        'packages/server/src/domains/backup/pending-uploads.ts',
        'packages/server/src/http/resources/backup.ts',
        'packages/server/src/http/controllers/admin/backup.controller.ts',

        'packages/server/src/domains/storage/s3-migration.ts',
        'packages/server/src/domains/images/services/upload.ts',
        'packages/server/src/domains/images/key.ts',
        'packages/server/src/domains/music/services/write/shared.ts',
        'packages/server/src/domains/fonts/services/upload.ts',
        'packages/server/src/domains/assets/services/storage.ts',
        'packages/server/src/infra/storage/backends/s3.ts',
        'packages/server/src/infra/image/process-worker.ts',
        'packages/server/src/http/resources/storage-redirect.ts',
        'packages/server/src/http/resources/admin-upload-route.ts',
        'packages/server/src/http/controllers/admin/images.controller.ts',

        'packages/server/src/domains/users/services/admin.ts',
        'packages/server/src/domains/users/services/account.ts',
        'packages/server/src/domains/friends/service.ts',
        'packages/server/src/domains/newsletter/service.ts',
        'packages/server/src/domains/notifications/service.ts',
        'packages/server/src/domains/update/service.ts',
        'packages/server/src/domains/update/job.ts',
        'packages/server/src/http/controllers/likes.controller.ts',
        'packages/server/src/http/controllers/admin/audit.controller.ts',
        'packages/server/src/http/controllers/admin/users-admin.controller.ts',
        'packages/server/src/http/loaders/search.ts',

        'packages/server/src/domains/analytics/geoip/update.ts',
        'packages/server/src/domains/update/pipeline.ts',
        'packages/shared/utils/src/url-schema.ts',

        'packages/web/admin/src/ui/settings/comments/CommentsAvatarCard.tsx',
        'packages/server/src/infra/email/sender.ts',
        'packages/server/src/infra/email/templates/layout/EmailLayout.tsx',
        'packages/server/src/infra/email/templates/AdminNotificationEmail.tsx',
        'packages/server/src/infra/email/templates/NewReply.tsx',
        'packages/server/src/domains/comments/services/email.ts',
        'packages/server/src/domains/friends/email.ts',
        'packages/server/src/domains/newsletter/email.ts',
        'packages/server/src/domains/notifications/email.ts',
        'packages/server/src/domains/webmentions/email.ts',

        'packages/server/src/domains/notifications/message.ts',
        'packages/server/src/domains/notifications/email.ts',
        'packages/server/src/domains/notifications/service.ts',
        'packages/server/src/bootstrap/db-lifecycle.ts',
        'packages/server/src/domains/settings/services/zeabur-mail-cleanup.ts',

        'packages/server/src/render/feed/generator.tsx',
        'packages/server/src/render/calendar/render.ts',
        'packages/server/src/render/calendar/locale.ts',
        'packages/server/src/http/resources/feed.ts',
        'packages/server/src/http/resources/calendar.ts',
        'packages/server/src/http/resources/images.ts',
        'packages/server/src/http/resources/assets.ts',
        'packages/server/src/http/middleware-pipeline.ts',
        'packages/ui/src/lib/font-stacks.ts',
        'apps/kobato/src/entry.server.tsx',
        'apps/kobato/src/root.tsx',
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
      'export const tag = "zh-CN"',
      'export const other = `zh-TW`',
      "'zh-HK'",
      '',
      'export function C() {',
      '  return <p>保存</p>',
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
    expect(scanSourceForI18nLiterals(invalid, 'packages/shared/i18n/src/fallback-messages.ts')).toEqual([])
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
    'packages/shared/i18n/src/sample.tsx',
  )

  it('exempts only the listed rule for a path', () => {
    const result = applyAllowlist(violations, [
      { path: 'packages/shared/i18n/src/sample.tsx', rules: ['hardcoded-locale'] },
    ])

    expect(result.allowlisted).toHaveLength(2)
    expect(result.violations.map((violation) => violation.rule)).toEqual(['jsx-text'])
  })

  it('exempts nothing outside the path prefix', () => {
    const result = applyAllowlist(violations, [{ path: 'packages/web/admin/src/ui/other.tsx' }])

    expect(result.allowlisted).toHaveLength(0)
  })

  it('narrows to an exact snippet when one is given', () => {
    const result = applyAllowlist(violations, [
      { path: 'packages/shared/i18n/src', rules: ['hardcoded-locale'], text: 'zh-TW' },
    ])

    expect(result.allowlisted.map((violation) => violation.text)).toEqual(['zh-TW'])
    expect(result.violations).toHaveLength(2)
  })
})
