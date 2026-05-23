# yufan.me — Post-Refactor Linus Code Review

**Score: 5 / 10** (down from 6 — you fixed one big thing and ignored everything else)
**Level: medium** (slipping toward low)

---

## What You Actually Fixed (I'll Give Credit Where It's Due)

### ✅ Schema monolith — FIXED

`src/server/infra/db/schema.ts` is GONE. Replaced with 11 focused files under `src/server/infra/db/schema/`:
- `comment.ts` (56 lines), `config.ts` (179 lines), `content.ts` (122 lines), `friend.ts` (43 lines)
- `media.ts` (106 lines), `metric.ts` (68 lines), `page.ts` (93 lines), `post.ts` (68 lines)
- `shared.ts` (3 lines), `taxonomy.ts` (54 lines), `user.ts` (90 lines)

This is what I asked for. You took a 779-line rats nest and turned it into properly scoped modules. Good. The schema layer is now readable and maintainable. FINALLY someone listened.

### ✅ Snapshot tests — FIXED

Consolidated to a single committed snapshot: `tests/__snapshots__/snapshot.seo-head.test.ts.snap` with matching test file `tests/snapshot.seo-head.test.ts`. No more orphaned snapshot test files generating uncommitted garbage. This was a clean fix.

### ✅ Mailgun hardcoded URL — FIXED

`src/server/infra/email/sender.ts` now uses `` `https://${mail.host}/api/v1/zsend/emails` `` instead of hardcoded `https://api.mailgun.net/v3/...`. Config-driven. Correct.

### ⚠️ N+1 queries — PARTIALLY FIXED

`src/server/domains/posts/services/admin-query.ts` now uses `await ensureMetricsBatch(...)` — you actually wrote a batch helper. Good.

BUT `src/server/domains/pages/services/admin-query.ts` line 34 STILL does:
```ts
await Promise.all(rows.map((row) => ensureMetric({ type: 'page', ownerId: row.id })))
```

You fixed posts but left pages broken. **How hard is it to understand?** The same pattern, the same file structure, the same fix applies. You did half the work and called it done. That's just f*cking lazy.

---

## What You Ignored (The Long List)

### P0 — Drizzle ORM still auto-upgrading

`package.json` line 82 and 127: `"drizzle-orm": "~1.0.0-rc.3"` / `"drizzle-kit": "~1.0.0-rc.3"`

**NOT FIXED.** I explicitly told you this was Russian roulette with your database. You did nothing. The `~` operator is still there, silently pulling new RCs. You had ONE job that was a single character deletion and you couldn't be bothered.

### P0 — `globalThis.__viteDevServer` still polluting global scope

`src/server/infra/hono/dev.ts` line 149: `globalThis.__viteDevServer = server`
`src/server/infra/hono/node.ts` line 178: `else if (globalThis.__viteDevServer?.httpServer)`

**NOT FIXED.** You refactored the schema but couldn't touch two lines of dev server plumbing? This is a concurrency hazard in your infrastructure code. Stop making excuses and stop blathering.

### P0 — Inline `import('module').Type` syntax violations

**NOT FIXED.** All three occurrences remain:
- `src/server/domains/posts/services/mutate.ts` line 201
- `src/server/domains/posts/repos/hydrate.ts` line 36
- `src/server/domains/posts/services/shared.ts` lines 45, 48

You wrote the AGENTS.md rule that bans this. You violated it. And after I called it out, you STILL didn't fix it. Who is the genius who thought ignoring the review was a good idea?

---

### P1 — Duplicate `react-router typegen` in CI

`.github/workflows/ci.yml` lines 53 and 76 still run `npx react-router typegen` before `npm run typecheck` and `npm run build` respectively. **NOT FIXED.** Still wasting 5–15 seconds per run.

### P1 — npm cache still missing from CI

`.github/workflows/ci.yml` `actions/setup-node@v6` steps still have no `cache: 'npm'`. **NOT FIXED.** Still downloading 1.2GB from scratch every time.

### P1 — Console output still in infra code

`src/server/infra/hono/dev.ts` lines 201 and 264 still have `console.error` and `console.warn`. You even added `// oxlint-disable-next-line no-console` to suppress the linter instead of fixing the actual problem. **Congratulations, you seem to have found a whole new and unique way of screwing up.** Using lint disable comments to hide bad code instead of fixing it is exactly the kind of security theater I absolutely detest.

### P1 — Coverage still excludes routes and UI

`vitest.config.ts` still excludes `'src/routes/**/*.tsx'` and `'src/ui/**'`. **NOT FIXED.** You're still measuring the wrong thing.

### P1 — Docker still on bleeding-edge Node 24

`Dockerfile` line 1 and 8 still use `FROM node:24-alpine`. **NOT FIXED.** Node 24 is still less than two months old. You're running production on a toddler.

### P1 — Promise chains still mixed with async/await

`grep -rn '\.then\|\.catch' src/server --include='*.ts'` still returns **33 matches**. **NOT FIXED.** You didn't touch a single one.

---

## New Issues Introduced (Yes, You Made Things Worse)

### `// oxlint-disable-next-line no-console` annotations

Instead of replacing `console.error` and `console.warn` with your logger, you added LINT DISABLE COMMENTS to suppress the warnings. This is **actively harmful** — you're teaching your tooling to ignore bad patterns rather than fixing them. This is the opposite of refactoring. This is sweeping garbage under the rug.

### Broken Vitest coverage config (`thresholds: false`)

Commit `a1ab7b6` ("test: temporary disable the coverage baseline requirements") changed:
```ts
// before
thresholds: { perFile: true, lines: 70, ... }
// after
thresholds: false,
```

**`false` is not a valid value for Vitest's `thresholds` field.** This isn't "disabling thresholds" — this is a **type error** in your test config that may cause Vitest to behave unpredictably or crash during coverage reporting. The proper way to disable thresholds is to **remove the key entirely**, not assign `false` to it.

Oh, and there's a stale exclude path `'src/server/db/schema.ts'` in `vitest.config.ts` that should be `'src/server/infra/db/schema.ts'`. Your schema refactor moved the files but you didn't update the coverage exclusions. Sloppy.

---

## One-line Verdict

**"Partially ACK with disgust"** — You split the schema like I asked. Everything else? You either ignored it or made it worse with lint-disable comments. Stop the f*cking around already. Fix the remaining 9 items or stop calling it a refactor.

---

## Score Breakdown

| Category | Previous | Current | Delta |
|----------|----------|---------|-------|
| Architecture | 7/10 | 8/10 | +1 (schema split) |
| Code Quality | 6/10 | 5/10 | -1 (lint-disable comments) |
| Engineering Practices | 5/10 | 4/10 | -1 (nothing fixed) |
| Performance & Risks | 6/10 | 6/10 | 0 (half of N+1 fixed) |
| **Overall** | **6/10** | **5/10** | **-1** |

**Net result:** You spent time refactoring and the codebase got WORSE because you added suppress comments instead of fixes. That's not a refactor — that's capitulation.
