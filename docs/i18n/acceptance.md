# i18n acceptance matrix

This document answers two questions: **which acceptance items already have automated evidence**, and
**which still need human review / real-browser verification**. It is both a template and a snapshot of
the current state.

> Snapshot time: 2026-11-08 21:11 (Asia/Shanghai), worktree `tmp/i18n-executor`.
> Browser acceptance results were first filled in on 2026-11-08 20:58 and re-run for the last time at
> 21:03 (§7 / §8).
> That worktree is being modified by several slices in parallel; the "current state" in this document
> is a snapshot, not a permanent conclusion. Every acceptance run **appends** a record at the end —
> never overwrite an older record.

## 1. Bottom line

- **Automated checks passing ≠ all 2800×4 strings have been human-reviewed.** The planned baseline in
  plan 002 is 2793×4 = 11,172 UI strings; the 2026-11-08 21:11 script re-check counted
  **2800 keys/locale = 11,200 strings**. Automation can only prove that keys are complete, ICU
  structure is consistent, nothing falls back to English, and the designated representative terms have
  not drifted; it cannot prove that the wording is natural, appropriate, or idiomatic for the region.
  There are additionally 99 server keys × 4 and 157 Inkling labels × 4.
- **No independent human review sign-off exists yet.** This document records no reviewer names, no
  sign-off dates, and no "reviewed" claims unless a reviewer has actually signed the matrix below.
  Author self-checks are not independent review.
- **Real-browser results have been filled in and the final re-run is complete.** `@playwright/test`
  1.65.0 is in the catalog / `devDependencies`, and `tests/browser/**` plus `pnpm run sea:browser` /
  `pnpm run test:browser` are in place. First recorded 2026-11-08 20:58, final re-run 21:03:
  **7/7 tests passed** on local Google Chrome 156.0.8078.80 (macOS 15.8.1, 1440×1000); the CI PR gate
  runs the same suite on bundled Chromium (§7). One local run is not a human review or cross-device
  acceptance of en-US / zh-HK / zh-TW.
- **HK/TW natural differences are not frozen wholesale.** At drafting time the UI catalog had 247
  HK/TW differing values; the 2026-11-08 21:11 script re-check counted **249**. The number of
  differences changes as the catalog grows; run `regional-diff` for the current value. Inkling editor
  labels have 0 HK/TW differences. Identical wording is allowed, and the number of differences is not
  a quality metric.

## 2. Status legend

| Marker | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| ✅     | Actually executed and passing this round (see §8 for commands and results)        |
| ⏳     | Has a test or process, but was not executed this round / produced no clean result |
| ⚠️     | Partially covered, with a clear gap                                               |
| ❌     | Not implemented or not configured                                                 |
| —      | Not applicable; or no record yet (human/browser columns)                          |

## 3. Acceptance matrix (actual current state)

| Item                       | Pass criteria                                                                                                                                                                                                                                        | Automated evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Automation status                                                                                                               | Human / browser status                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Routes and public pages    | Under all four locales `<html lang>`, `Content-Language`, and `og:locale` are correct; navigation/404/footer copy comes from the current catalog with no English fallback; client-side navigation reads the same catalog                             | `tests/e2e/public/i18n.test.ts`; `tests/it/routes/public/detail.test.ts` (30/30); `tests/unit/root.i18n.test.tsx`; `tests/unit/root-document-locale.test.tsx`; `tests/browser/public-i18n.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ Passed this round: `sea:e2e` 9 files / 19 tests (`public/i18n` 1/1); it detail 30/30; root unit ✅; browser public pages 2/2 | ✅ Browser public pages (§7); human review not signed off           |
| Email                      | Subject/body/CTA/footer for all four locales come from the server catalog; `lang` is correct; user content is not translated                                                                                                                         | `tests/unit/server/infra/email/email-messages.test.ts` (four-locale key completeness); `tests/unit/server/infra/email/templates/email-templates-i18n.test.tsx` (per-template rendering for en-US / zh-TW)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ✅ Passed this round                                                                                                            | ⏳ No per-template human review; HK/TW email wording not signed off |
| Feed / Atom                | RSS `<language>`, Atom `xml:lang`, and `Content-Language` follow the locale; ETag is separated by locale + revision; a conditional request for a language never returns an old-language 304                                                          | `tests/it/server/http/resources/feed.test.ts` (19/19); `tests/e2e/public/i18n.test.ts` (RSS/Atom/ETag/old-language 304)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅ Passed this round: it 19/19; e2e 1/1                                                                                         | —                                                                   |
| Calendar                   | Month/week/lunar/almanac labels follow the locale; en-US renders no lunar/almanac data; ETag/`Content-Language` follow locale and revision; HK/TW share the human-reviewed Traditional static table and may be byte-identical                        | `tests/unit/server/http/resources/calendar.test.ts` (cache key/ETag/304, 17/17); `tests/e2e/public/i18n.test.ts` (real PNG pixel diff, en-US vs zh-CN)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ✅ Passed this round: unit 17/17; e2e pixel assertion 1/1                                                                       | ⏳ No independent review sign-off recorded for calendar terminology |
| Settings switch (language) | Flush all dirty cards first, then submit the locale, and reload exactly once on success; if any card fails, veto the switch, keep the input, and do not reload; the whole settings panel is inert + `aria-busy` during the switch; focus is restored | `tests/unit/ui/admin/settings/general-locale-switch.test.tsx`; `tests/unit/ui/admin/settings/use-locale-switch.test.tsx`; `tests/unit/ui/admin/settings/general-locale-visibility.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅ Passed this round (all three)                                                                                                | ✅ Real browser success/failure switch + focus (§7)                 |
| Cross-tab                  | After A switches language it broadcasts; B saves its own dirty fields first and then reloads, never writing back A's locale; a failure keeps the edit; degrades safely without `BroadcastChannel`                                                    | `tests/unit/client/lib/locale-sync.test.ts`; `tests/unit/ui/admin/settings/general-locale-sync.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅ Passed this round                                                                                                            | ✅ Real two-tab browser (§7)                                        |
| Content language           | post/page accepts an optional BCP 47 `contentLanguage`; a valid value is emitted as `lang` on the body container; an empty value emits no `lang`; content is not translated, the UI locale is unchanged, Feed URLs are unchanged                     | `tests/it/server/domains/posts/integration.test.ts`, `tests/it/server/domains/pages/integration.test.ts` (create/update round-trip, omit preserves, null clears, invalid tag descriptor); `tests/unit/server/domains/content/content-language.test.ts` (normalize/validate/reject paths); `tests/it/server/infra/db/migrate.test.ts` (nullable column, no backfill); `tests/snaps/ui/public/post/detail-body-lang.test.tsx` (body `lang` / no `lang` for empty / chrome does not follow content language); `tests/snaps/ui/admin/editor-shared/content-language-field.test.tsx` (label/hint/error in four locales); `tests/it/server/domains/backup/services/backup-restore.test.ts` (backup/restore preserves the field) | ✅ Passed this round (migration/DTO/integration/SSR/editor/backup)                                                              | ✅ Real browser `ar` + `dir=auto` (§7)                              |
| Real browser               | Completed in real Chromium: dirty-card success/failure switch, Portal focus, cross-tab sparse save/reload, hydration after reloading in all four locales, comment composer current labels, `contentLanguage` DOM                                     | `tests/browser/locale-sync.spec.ts` (5 journeys); `tests/browser/public-i18n.spec.ts` (2 journeys); `scripts/browser/run.ts` + `scripts/sea/browser.ts`; `tests/browser/playwright.config.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ✅ 7/7 this round (Chrome 156.0.8078.80 / macOS 15.8.1)                                                                         | ✅ See §7                                                           |

## 4. Automated check details

The commands below are the evidence this repository can currently produce; `✅` only means the command
exited 0, not that the copy is good.

```bash
# Catalog structure / ICU / representative terms (the term tests added by this document run in the first command)
pnpm exec vitest run --project unit tests/unit/shared/i18n

# Four-locale email key completeness and template rendering
pnpm exec vitest run --project unit tests/unit/server/infra/email

# Language switch / cross-tab
pnpm exec vitest run --project unit tests/unit/ui/admin/settings tests/unit/client/lib/locale-sync.test.ts

# Feed / calendar / settings snapshots
pnpm exec vitest run --project it tests/it/server/http tests/it/server/domains/settings
pnpm exec vitest run --project unit tests/unit/server/http/resources/calendar.test.ts

# Real HTTP journeys in four languages (needs the SEA binary; not part of pnpm test)
pnpm run sea:e2e

# Real Chromium browser journeys (needs the SEA binary; not part of pnpm test)
pnpm run sea:browser
pnpm run test:browser   # managed SEA boot, or KOBATO_BROWSER_BASE_URL pointing at an external instance

# Read-only difference report (does not modify the catalog)
pnpm exec vite-node scripts/i18n/regional-diff.ts --keys
```

**What automation can prove:** the four catalogs have identical key sets, ICU parameters and branches
are valid, the English baseline has no Chinese residue, the root loader uses the current locale, the
locale is propagated through the email/feed/calendar/settings seams, and the representative terms have
not drifted.

**What automation cannot prove:** whether translations are natural, whether they fit HK/TW regional
usage, whether there are untranslated sentences that are still grammatical, how email renders in real
mail clients, whether browser hydration flickers, Focus/Portal interactions, and real two-tab timing.

## 5. Human review matrix (template)

There is currently **no recorded independent review sign-off**. Every status in the table below is
`Not signed off`, not "passed". The item counts are the current values from the 2026-11-08 21:11 script
re-check; the planned baseline in plan 002 is UI 2793, Server 99, Inkling 157.

| Scope         | Current item count | Reviewer | Date | Verdict        | Notes                                                |
| ------------- | ------------------ | -------- | ---- | -------------- | ---------------------------------------------------- |
| UI en-US      | 2800               | —        | —    | Not signed off | English baseline; author self-checks do not count    |
| UI zh-CN      | 2800               | —        | —    | Not signed off |                                                      |
| UI zh-HK      | 2800               | —        | —    | Not signed off | Focus: written Cantonese, 電郵, 留言, 讚好, 重新載入 |
| UI zh-TW      | 2800               | —        | —    | Not signed off | Focus: 電子郵件, 評論, 按讚, 重新整理                |
| Server en-US  | 99                 | —        | —    | Not signed off | Email and notifications                              |
| Server zh-CN  | 99                 | —        | —    | Not signed off |                                                      |
| Server zh-HK  | 99                 | —        | —    | Not signed off |                                                      |
| Server zh-TW  | 99                 | —        | —    | Not signed off |                                                      |
| Inkling en-US | 157                | —        | —    | Not signed off |                                                      |
| Inkling zh-CN | 157                | —        | —    | Not signed off |                                                      |
| Inkling zh-HK | 157                | —        | —    | Not signed off | Currently identical to zh-TW                         |
| Inkling zh-TW | 157                | —        | —    | Not signed off | Currently identical to zh-HK                         |

Sign-off rules:

1. The reviewer must be someone other than the author of the change; an author's self-check can only be
   recorded as "self-check", never as "review".
2. A record must include the **scope** (locale + namespace + key list or file diff), the **date**, the
   **verdict** (pass / changes required / blocked), and the **uncovered items**.
3. Re-review the affected keys after any change; do not carry an old sign-off forward.
4. Do not backfill a retroactive signature; no record means no record.

## 6. 2800×4 and the limits of "automated pass" (planned baseline 2793×4)

The planned baseline is **2793 UI keys × 4 locales = 11,172 UI strings**; the 2026-11-08 21:11 script
re-check counted **2800 × 4 = 11,200**, plus 99 server keys × 4 and 157 Inkling labels × 4. The current
worktree is still appending keys in parallel (UI was 2796 at drafting time and later grew to 2800), so:

- The counts change; `pnpm exec vite-node scripts/i18n/regional-diff.ts` prints the current values.
- Whether the count is 2793, 2800, or higher, **a passing catalog validation only proves structural
  completeness**; it says nothing about whether any single string has been human-reviewed.
- This document refuses to substitute "all tests green" for review sign-off, and refuses to treat
  "HK/TW has 249 differences" as review completeness.

## 7. Real-browser acceptance

Environment: **Google Chrome 156.0.8078.80** (local system Chrome channel, headless),
**macOS 15.8.1 (24H32), x86_64**, viewport **1440×1000**. The instance is `dist-sea/kobato` (built with
the official Node v26.13.0 darwin-x64 build; the local `/usr/local/bin/node` is a universal binary and
`--build-sea` rejects it because of multiple sentinels). Worktree baseline `bcc0ccfe` plus uncommitted
changes (commits are forbidden in this worktree, so there is no new SHA). UI locale baseline is zh-CN;
each journey switches to en-US / zh-HK / zh-TW internally and returns to zh-CN.

Commands: `pnpm run sea:browser` → exit 0, `7 passed (36.9s)` (final worktree re-run);
`pnpm run test:browser` (same suite, managed boot) → exit 0, `7 passed (38.0s)`. Trace/screenshot/video
are kept only on failure; there were no failure attachments this round, and the HTML report is at
`tmp/browser-report/index.html` (`tmp/` is gitignored).

CI gate (same suite as the local result):

- The `build` job in `.github/workflows/ci.yml` runs, on **pull_request** events (targeting `main` /
  `develop`), `sea:build` → `pnpm exec playwright install --with-deps chromium` →
  `pnpm run sea:browser dist-sea/kobato`, with `KOBATO_BROWSER_CHANNEL=chromium` set; plain pushes in
  that workflow only run `pnpm run build`.
- `build-develop` in `.github/workflows/sea.yml` runs the full chain on PRs and develop pushes
  (`sea:build` → `sea:smoke` → `sea:e2e` → Chromium → `sea:browser`); the `build` matrix runs the same
  browser journeys on main / tag / release / dispatch.
- Locally the default is the system Chrome channel; CI uses Playwright's bundled Chromium. The test
  set, the 7 tests, and the assertions are identical. This document records the local 7/7; the result
  of a CI PR run is whatever that run's log says and is not countersigned here.

The 8 acceptance items below correspond to 7 Playwright tests: `Portal focus` is the same assertion
inside the `dirty card + failed switch` test, not an eighth test.

| Journey                                 | Pass criteria                                                                                            | Browser / version                   | Build SHA                 | Result | Evidence (Playwright test name)                                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dirty card + successful language switch | Dirty fields are saved first, then the switch happens with one reload; no input is lost                  | Chrome 156.0.8078.80 / macOS 15.8.1 | bcc0ccfe + dirty worktree | Passed | `a successful switch saves the dirty card, reloads once, and hydrates cleanly`                                                                                                       |
| dirty card + failed switch              | The switch is vetoed; input is preserved; the panel leaves the inert state; focus returns to the trigger | Same                                | Same                      | Passed | `a failed dirty-card flush vetoes the locale switch`                                                                                                                                 |
| Portal focus                            | After the language dropdown options unmount from the Portal, focus still returns to the `SelectTrigger`  | Same                                | Same                      | Passed | Same as above (`toBeFocused` on `#general-locale`)                                                                                                                                   |
| Cross-tab sparse save                   | A switches language; B submits only its own dirty fields, then reloads; B never writes the locale back   | Same                                | Same                      | Passed | `two tabs: A switches the language while B saves its own field and never writes the locale`                                                                                          |
| Four-locale reload hydration            | Cold load/refresh in all four locales has no hydration mismatch; `<html lang>` matches the server        | Same                                | Same                      | Passed | `every locale reloads with its own html lang and menu, with clean hydration` (en-US / zh-HK / zh-TW / zh-CN)                                                                         |
| Comment composer labels                 | After interaction the public comment composer loads the current locale's labels; no English flashback    | Same                                | Same                      | Passed | `the public comment composer loads only the active locale label chunk` (requests only the zh-CN labels chunk)                                                                        |
| Content language DOM                    | With `contentLanguage` set, the body container emits `lang`; an empty value emits no `lang`              | Same                                | Same                      | Passed | `contentLanguage ar stamps lang and dir=auto on the body only` (the browser only verifies `ar`; the empty case is covered by `tests/snaps/ui/public/post/detail-body-lang.test.tsx`) |
| Unsaved content on a non-settings page  | No hard refresh; an explicit prompt appears ("another tab has switched the language" + a refresh button) | Same                                | Same                      | Passed | `an editor with unsaved content is not hard-reloaded by the locale broadcast`                                                                                                        |

Record requirements: browser name and full version, operating system, build SHA, locale, viewport,
result (pass/fail), and screenshot or trace paths. Keep reproduction steps on failure; never write only
"looks fine".

## 8. Execution log for this round

| Time             | Command                                                                                                                                                                                                                                                                                                                             | Result                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-08 19:39 | `pnpm exec vitest run --project unit tests/unit/shared/i18n/glossary.test.ts`                                                                                                                                                                                                                                                       | ✅ 8/8                                                                                                                                                         |
| 2026-11-08 19:40 | `pnpm exec vitest run --project unit tests/unit/shared/i18n/catalog.test.ts tests/unit/shared/i18n/glossary.test.ts tests/unit/shared/i18n/inkling-labels.test.ts tests/unit/server/infra/email/email-messages.test.ts tests/unit/server/http/resources/calendar.test.ts tests/unit/root-document-locale.test.tsx`                  | ✅ 242/242                                                                                                                                                     |
| 2026-11-08 19:40 | `pnpm exec vitest run --project unit tests/unit/shared/i18n ...` (including app-localization)                                                                                                                                                                                                                                       | ⚠️ 116/117; `app-localization.test.ts` failed once because a parallel change made the `snapshot.ts` revision a string; running that file alone ✅ 5/5          |
| 2026-11-08 19:40 | `pnpm exec vitest run --project it tests/it/server/http/resources/feed.test.ts ...`                                                                                                                                                                                                                                                 | ⚠️ 52/54; two `general-cache-invalidation.test.ts` cases failed due to the same parallel revision change, not used as evidence here                            |
| 2026-11-08 19:40 | `pnpm exec vitest run --project unit ... general-locale-switch / general-locale-sync / use-locale-switch / locale-sync / root.i18n`                                                                                                                                                                                                 | ✅ Passed (the relevant items, apart from the parallel failures above)                                                                                         |
| 2026-11-08 19:41 | `pnpm exec vitest run --project unit tests/unit/shared/types/pages.test.ts tests/unit/shared/types/catalog.test.ts` and `--project it tests/it/server/domains/posts/repos.test.ts tests/it/routes/public/detail.test.ts` and `--project snaps tests/snaps/ui/admin/posts/post-meta.test.tsx`                                        | ✅ 12/12, 51/51, 18/18                                                                                                                                         |
| 2026-11-08 19:43 | `pnpm exec vitest run --project unit tests/unit/ui/admin/settings/general-locale-visibility.test.tsx`                                                                                                                                                                                                                               | ✅ 2/2                                                                                                                                                         |
| 2026-11-08 19:44 | `pnpm exec vitest run --project snaps tests/snaps/ui/public/post/detail-body-lang.test.tsx`, `--project it tests/it/server/domains/posts/integration.test.ts tests/it/server/domains/pages/integration.test.ts`, `--project unit tests/unit/server/domains/content/content-language.test.ts`                                        | ✅ 2/2, 9/9, 12/12 (content language)                                                                                                                          |
| 2026-11-08 19:39 | `pnpm exec vite-node scripts/i18n/regional-diff.ts`                                                                                                                                                                                                                                                                                 | ✅ Read-only report (values from that run): UI HK/TW 247; server HK/TW 1; Inkling HK/TW 0                                                                      |
| 2026-11-08 19:45 | `pnpm exec vitest run --project snaps tests/snaps/ui/admin/editor-shared/content-language-field.test.tsx`, `--project it tests/it/server/infra/db/migrate.test.ts`, `--project it tests/it/server/domains/backup/services/backup-restore.test.ts`                                                                                   | ✅ 10/10, 5/5, 8/8 (content-language editor in four locales + migration + backup restore)                                                                      |
| 2026-11-08 19:55 | `pnpm exec vitest run --project it tests/it/routes/public/detail.test.ts` (added `contentLanguage` assertions for the post/page loader), `--project unit tests/unit/ui/admin/posts/build-upsert-payload.test.ts` (an invalid tag sends no request)                                                                                  | ✅ 30/30, 3/3                                                                                                                                                  |
| 2026-11-08 19:56 | `pnpm exec vitest run --project it tests/it/server/domains/{posts,pages,content,backup} tests/it/server/infra/db tests/it/server/http/controllers/admin/{posts,pages}.test.ts`, `--project snaps` (full)                                                                                                                            | ✅ 50 files/517 tests; ✅ snaps 123 files/737 tests                                                                                                            |
| 2026-11-08 20:52 | `pnpm run sea:browser` (`dist-sea/kobato`, built with official Node v26.13.0 darwin-x64; Chrome 156.0.8078.80, macOS 15.8.1, 1440×1000)                                                                                                                                                                                             | ✅ 7/7 (in 38s; exit 0): failure veto, successful switch, four-locale reload, two tabs, non-settings-page prompt, comment composer labels, contentLanguage DOM |
| 2026-11-08 21:00 | `pnpm run test:browser` (managed SEA boot, same suite; `KOBATO_BROWSER_CHANNEL` unset → system Chrome)                                                                                                                                                                                                                              | ✅ 7/7 (38.0s; exit 0)                                                                                                                                         |
| 2026-11-08 21:00 | `pnpm exec playwright test --config tests/browser/playwright.config.ts --list`; `pnpm exec oxlint -c oxlint.config.ts tests/browser scripts/browser scripts/sea/browser.ts scripts/sea/inject.ts`                                                                                                                                   | ✅ 7 tests listed; ✅ 0 warnings / 0 errors                                                                                                                    |
| 2026-11-08 21:03 | `pnpm run sea:browser` (final worktree re-run, all 7 journeys; `dist-sea/kobato`)                                                                                                                                                                                                                                                   | ✅ 7/7 (36.9s; exit 0)                                                                                                                                         |
| 2026-11-08 21:11 | `pnpm exec vite-node scripts/i18n/regional-diff.ts` (final re-check)                                                                                                                                                                                                                                                                | ✅ Read-only report: UI **2800 keys/locale**, HK/TW **249**; server 99, HK/TW 1; Inkling 157, HK/TW 0                                                          |
| 2026-11-08 21:11 | `pnpm exec vitest run --project it tests/it/server/http/resources/feed.test.ts tests/it/server/http/resources/images.test.ts tests/it/server/domains/settings/general-cache-invalidation.test.ts tests/it/server/domains/settings/locale-migration.test.ts tests/it/server/domains/settings/locale-write-schema.test.ts`            | ✅ 5 files / **64/64** (Feed/Atom and settings caching are now clean)                                                                                          |
| 2026-11-08 21:12 | `pnpm run sea:e2e` (`dist-sea/kobato`, real HTTP)                                                                                                                                                                                                                                                                                   | ✅ 9 files / **19/19**; `public/i18n.test.ts` 1/1 (route public pages, RSS/Atom, manifest, calendar, old-language 304)                                         |
| 2026-11-08 21:13 | `pnpm exec oxlint -c oxlint.config.ts tests/unit/shared/i18n/glossary.test.ts scripts/i18n/regional-diff.ts`                                                                                                                                                                                                                        | ✅ 0 warnings / 0 errors                                                                                                                                       |
| 2026-11-08 21:14 | `pnpm exec vitest run --project it tests/it/routes/public/detail.test.ts`                                                                                                                                                                                                                                                           | ✅ 30/30 (locale/contentLanguage assertions on the public detail route)                                                                                        |
| 2026-11-08 21:14 | `pnpm exec vitest run --project unit tests/unit/shared/i18n/glossary.test.ts tests/unit/shared/i18n/catalog.test.ts`; `pnpm exec oxfmt -c oxfmt.config.ts --check docs/i18n/glossary.md docs/i18n/acceptance.md docs/adr/0011-four-locale-i18n-foundation.md tests/unit/shared/i18n/glossary.test.ts scripts/i18n/regional-diff.ts` | ✅ 26/26 (glossary 8 + catalog 18); ✅ 5 files formatted                                                                                                       |
| 2026-11-08 21:21 | `pnpm run sea:browser` (rebuilt `dist-sea/kobato` from the latest source, confirming the CI change did not break the browser gate)                                                                                                                                                                                                  | ✅ 7/7 (37.3s; exit 0)                                                                                                                                         |

## 9. Maintenance rules

1. When adding or changing an acceptance item, add both automated evidence and human review scope; writing
   only "covered" without evidence does not count as acceptance.
2. Append a §8 record before every release and keep the history; failed records are never deleted.
3. Only the actual reviewer may record a human sign-off; authors must not sign on someone's behalf.
4. Browser results may only come from real Chromium (or a real browser that is explicitly named); jsdom /
   happy-dom results must never be presented as browser results.
5. Terminology decisions are governed by [`glossary.md`](./glossary.md); the acceptance matrix does not
   redefine terms.

## Plan 002 final delivery acceptance (2026-11-08)

- `pnpm run fmt`, `pnpm run lint` (0 warnings / 0 errors), `pnpm run type`, and `pnpm run build`: passed.
- `pnpm run test`: 1237 files passed / 1 skipped; 11725 tests passed / 1 skipped.
- New SEA: smoke 23/23; HTTP e2e 9 files / 19 tests; real Chromium `sea:browser` and `test:browser` both 7/7.
- The public home-page SSR document measured 72,576 bytes (previously about 240KB); the public catalog has
  496 keys, about 8.5KB gzipped.
- Final binary SHA-256: `2c5fa8d31b868edd6eea8b65bafa223266441e2025e91711149681c5d34984cf`.
- Human regional terminology sign-off status is unchanged: not signed off; automated and browser evidence
  do not replace human review.
