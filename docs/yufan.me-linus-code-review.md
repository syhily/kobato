# yufan.me — Code Review (Linus Torvalds Style)

> **Reviewer:** Kimi Code CLI  
> **Date:** 2026-05-22  
> **Project:** yufan.me v5.0.0 — Self-hosted blog CMS (React Router 7 SSR / Hono / oRPC / Drizzle / Postgres / Redis)  
> **SLOC:** ~82K source, ~19K tests, 135 test files  
> **Score:** 7.5 / 10  
> **Peer Tier:** **High** (upper quartile among indie fullstack TypeScript CMS projects)

---

## 0. Executive Summary

This is **not** a toy project. It's a real, opinionated, production-deployed CMS with actual users, actual content, and actual complexity. The author has clearly been burned by bad architecture decisions in the past and has invested heavily in boundaries, conventions, and type safety. That said, there are design compromises that range from "acceptable for a single-tenant blog" to "this will bite you when traffic scales." The code is learnable, the conventions are documented, and the testing is above-average for this category. But don't mistake thoroughness for industrial-grade robustness — there are architectural shortcuts that would get a hard NO in a code review at any serious SaaS company.

---

## 1. 优点 (Specific, Technical)

### 1.1 Architecture Boundaries Are Enforced, Not Suggested

The five-layer structure (`routes/`, `server/`, `client/`, `ui/`, `shared/`) with explicit import constraints is **actually followed**. The `AGENTS.md` files at every level make the rules machine-readable for humans. Inside `server/`, the单向导入图 (`infra → domains → http`, `domains → render → http`) is real — grep confirms `infra/` never imports from `domains/` or `http/`. This is rare. Most projects document layers and then ignore them.

### 1.2 Type-Safe API Perimeter (oRPC + Zod)

Every HTTP call goes through `/rpc/*` via oRPC. The four base procedures (`publicProc`, `authedProc`, `authorProc`, `adminProc`) chain auth middleware, and the leaf inherits the guard. The browser client is built from `typeof apiRouter`. There is **no** `any`-typed API client hiding in a `lib/api.ts` file. Even better: `shared/contracts/*.ts` contains Zod DTOs paired with compile-time parity assertions (`Assert<Equals<z.infer<typeof Dto>, Type>>`). This catches schema drift at compile time. **Good engineering.**

### 1.3 Audit Log Batcher: COPY FROM STDIN with Fallback

`src/server/domains/audit/batcher.ts` implements an in-memory buffer (50 events / 500ms flush) that writes via Postgres `COPY FROM STDIN` for throughput. On COPY failure, it falls back to per-row INSERT, and on batch INSERT failure, it falls back to individual row INSERT with per-row error handling. Events are flushed on `SIGTERM`/`SIGINT`/`beforeExit`. This is **exactly** how you build an audit pipeline without losing events. The CSV escaping is hand-written and tested. Respect.

### 1.4 Database Migration Locking

Migrations use `pg_advisory_lock(hashtext('yufan.me'), hashtext('drizzle'))` to prevent concurrent migration runs in multi-instance deployments. The lock is released in `finally`. This is basic but frequently omitted. It's here, it's correct, and it's documented.

### 1.5 Privacy-Aware Logging

The logger (`src/server/infra/logger.ts`) automatically wraps known L3 fields (`email`, `ip`, `userAgent`, `name`, etc.) in `{E}…{/E}` markers. L5 fields (`authorization`) are redacted to `[REDACTED]`. This isn't just compliance theater — the conventions are documented, tested, and enforced by custom lint rules via `oxlint`.

### 1.6 Zero Barrel Files, Zero Default Exports

Grep confirms: `src/server/` has 2 default exports (both likely third-party type declarations). `src/shared/`, `src/client/`, and `src/ui/` have **zero**. This eliminates tree-shaking surprises and import ambiguity. The `oxc/no-barrel-file` rule is set to `error`. The project walks the walk.

### 1.7 Section-Scoped Settings (No God Object)

Settings are split into 14 JSONB rows (`blog.general`, `blog.assets`, `blog.navigation`, etc.) instead of one mega-settings table. Concurrent admin tabs save independently without racing. The UI uses per-section hooks instead of a monolithic `useBlogSettingsBundle()`. This is a direct response to a previous bad design (the `AGENTS.md` explicitly warns against reintroducing `BlogConfigContext`), and the fix is architecturally sound.

### 1.8 Rate Limiting Is Multi-Dimensional and Privacy-Respecting

Rate limits are keyed by IP, email hash (SHA-256 truncated to 128 bits), user ID, and admin+email pairs. The email is hashed before hitting Redis. Buckets are configurable per-settings and read synchronously from an in-process snapshot. This is **better than most commercial auth stacks**.

---

## 2. 致命问题 (Will Cause Pain in Production)

### 2.1 Process-Level Cache Is a Known Coherency Bomb

`src/server/infra/cache/process-cache.ts` is explicitly documented as broken in multi-process deployments: "Cache invalidation only reaches the current process; other processes see stale data until their own TTL expires." The author knows this, warns about it, and then uses it anyway for `postMetaCache` (10s TTL) and other hot paths.

**Why this is fatal:** In a Docker Swarm / Kubernetes deployment with 2+ replicas, an admin publishes a post. The request hits Pod A, which clears its local cache. Pod B still serves stale data for up to 10 seconds. For a blog, 10s is "fine." For a comment moderation queue or a settings change that disables comments, it's a consistency bug that users will notice and report as "my changes don't take effect."

**Fix:** Use Redis for cache invalidation pub/sub, or drop the process cache entirely and rely on Postgres query cache + connection pooling. The "Redis round-trip costs more than recomputation" argument is premature optimization for a CMS with admin-triggered writes.

### 2.2 BigInt Serialization Is a Minefield with 84 Call Sites

There are **84 occurrences** of `BigInt(` in `src/server/`. The database uses `bigserial` and `bigint` for IDs. The wire format uses `idString` (a Zod `z.string().regex(/^\d+$/)`) to serialize numeric IDs as strings. This is correct — but it's a **convention** enforced by human review, not by the type system.

At `src/server/http/controllers/admin/posts.controller.ts`, every handler does `BigInt(input.id)` manually. If someone forgets this in a new endpoint, or passes a `bigint` into a JSON response without stringifying, you get a runtime `TypeError: Do not know how to serialize a BigInt`. oRPC's Zod output schema will catch *some* of these, but not all — especially if a service function returns a raw DB row with a `bigint` field that isn't in the Zod output schema (because it was supposed to be projected out).

**Fix:** Use `json-bigint` or a custom JSON serializer at the framework level. Or better: stop using `bigint` in JS altogether. Use `number` for IDs up to 2^53-1 (9 quadrillion), which is enough for any blog. If you really need 64-bit IDs, use UUIDs or nanoids and avoid the serialization impedance mismatch entirely.

### 2.3 dangerouslySetInnerHTML Is Used on Untrusted Input Paths

There are **8 call sites** of `dangerouslySetInnerHTML` in `src/ui/`, including:
- `AuditLogTable.tsx` (audit log detail HTML)
- `MermaidBlock.tsx` (SVG rendered from user-authored Mermaid diagrams)
- `MathBlock.tsx` (KaTeX output)
- `InlineMarkPanels.tsx` (preview HTML)

The Mermaid and Math blocks receive content from the Tiptap editor, which is an admin-facing surface. **But:** the audit log table renders `details` HTML from the server, and the comment system allows guest users to submit Markdown that gets rendered to HTML. If the server-side sanitization in `canonicalizeCommentBody` or the PT-to-HTML renderer has a bypass, this is an XSS vector.

**Fix:** Audit every `dangerouslySetInnerHTML` call site. Ensure server-side HTML generation uses a strict allowlist (DOMPurify or equivalent). The `react/no-danger` lint rule is explicitly turned **off** — document *why* each site is safe, and add unit tests that attempt XSS payloads against the sanitization pipeline.

### 2.4 Service Layer Files Are Bloated and Violate Single Responsibility

- `src/server/domains/posts/service.ts`: **546 lines**, 12 exported async functions, mixes catalog loading, draft saving, publishing, revision management, and meta updates.
- `src/server/domains/comments/service.ts`: **507 lines**, handles public comments, admin moderation, email notifications, badge rendering, and user deduplication.

These aren't "services" in the DDD sense — they're **god files** that accumulate logic because the convention says "business logic stays in `domains/<x>/service.ts`." The AGENTS.md locked the vocabulary to `schema.ts / repo.ts / service.ts / projection.ts / cache.ts`, which sounds good until `service.ts` becomes a 500-line dumping ground.

**Fix:** Split by use case. `posts/service.ts` should become `posts/services/catalog.ts`, `posts/services/draft.ts`, `posts/services/publish.ts`, etc. The "locked vocabulary" convention is too rigid for a domain with this much surface area.

### 2.5 No Integration Tests — Only Unit Tests with Heavy Mocking

The test suite has **135 files**, **543 `vi.mock` calls**, and **630 `vi.fn` calls**. This is a unit-test-heavy, integration-test-light suite. The `server.http.orpc-smoke.test.ts` is a smoke test for the oRPC middleware chain, but it uses a **miniature router** (`const router = { public: { echo: ... } }`), not the actual production router. It doesn't test the real `apiRouter`.

There are no tests that spin up the Hono server, hit a real endpoint, and verify the database state. The CI runs `vp test run` in a Node environment, but the coverage config excludes `src/routes/**/*.tsx` and `src/ui/**` entirely. This means the React components, the SSR hydration path, and the route loaders are **untested** in CI.

**Fix:** Add at least one integration test harness that boots the Hono app with a test Postgres database (via `pg-mem` or Docker) and exercises full request/response cycles. The current test strategy will catch logic bugs but not wiring bugs — like a controller forgetting to call `recordAuditEventFromContext` or a Zod schema mismatch between `shared/contracts` and `shared/types`.

---

## 3. 一般问题 (Acceptable but Ungraceful)

### 3.1 `useEffect` / `useState` Proliferation in UI

`src/ui/` has **170 `useEffect`**, **298 `useState`**, **129 `useCallback`**, and **100 `useMemo`** across **227 `.tsx` files**. That's ~0.75 effects, ~1.3 states, and ~0.6 memos per component. For a React 19 project, this is surprisingly imperative. Many of these are likely derived state that could be computed during render, or side effects that belong in server loaders / mutations.

The admin settings shell alone has `useSettingsScrollSpy`, `useSettingsSearch`, `useSettingsCard`, `useDebouncedSearch`, `useIsActiveLink`, etc. The abstractions are good, but the sheer volume suggests the UI layer hasn't fully embraced React 19's server components and form actions.

### 3.2 Node.js 25 Is Bleeding Edge and Risky

The CI runs on `node-version: 25`. The Dockerfile uses `node:25-alpine`. Node 25 is not an LTS release. This is a blog CMS, not a framework that needs V8 optimizations from the future. If Node 25 has a regression in `crypto`, `stream`, or `vm`, this project is on the front lines.

**Fix:** Pin to the latest LTS (Node 22 as of mid-2026). The `package.json` `engines` field should enforce this.

### 3.3 `globalThis` Singletons Make Tests Fragile

The project uses `globalThis` symbols to survive HMR (`global-singleton.ts`) and for test isolation resets (`audit.batcher.test.ts` deletes the global key before each test). This works, but it's a smell. Vitest's `vi.mock` is module-level, but global state leaks across test files unless every file remembers to reset the right symbols.

**Fix:** Use dependency injection for the batcher and cache instances. Pass them through context or accept them as constructor arguments. `globalThis` is a band-aid for HMR — fix the HMR configuration instead.

### 3.4 Chunk Size Warning Limit Is Too Permissive

`vite.config.ts` sets `chunkSizeWarningLimit: 800`. The manual chunk splits `editor-tiptap` (Tiptap + ProseMirror), but the default limit is 500KB for a reason. With 71 production dependencies including `@aws-sdk/client-s3`, `@napi-rs/canvas`, `openai`, and `sharp`, the vendor bundle is likely enormous. The public site should not pay for the admin editor's dependencies.

**Fix:** Verify the public route bundle sizes with `vp build` and `rollup-plugin-visualizer`. If the public bundle is >200KB gzipped, split more aggressively.

### 3.5 Transaction Boundaries Are Inconsistent

`db.transaction` is used in 5 files (`like.ts`, `category.ts`, `posts/service.ts`, `content/repo.ts`). But complex operations like `createPost` (which inserts post meta, ensures tags exist, and creates a revision) don't appear to wrap the entire flow in a transaction. If tag insertion fails after the post meta is written, you get a partial post.

**Fix:** Audit every multi-table write path. Use Drizzle's `db.transaction()` at the service layer, not just the raw operations layer.

### 3.6 The `console.error` in `env.ts` Is a Localization Anomaly

`src/server/infra/env.ts` prints a Chinese error message on env validation failure (`请确认 .env 文件中已正确设置以下变量`). Every other log line in the project is English. This is inconsistent and will confuse non-Chinese operators.

**Fix:** Log in English. Localization belongs in the UI, not in infrastructure error messages.

---

## 4. 是否值得学习？

**Yes, with caveats.**

This project is worth studying if you want to see:
- How to enforce architectural boundaries in a mid-size TypeScript codebase without a custom compiler.
- How to build a type-safe fullstack API with oRPC + Zod + React Router 7.
- How to structure a CMS content model (posts, pages, revisions, taxonomies) with referential integrity.
- How to implement audit logging that doesn't lose events.
- How to write conventions that AI agents and humans can both follow (`AGENTS.md` is genuinely good documentation).

It is **not** worth copying wholesale if you need:
- Multi-tenant SaaS architecture (no tenant isolation, no row-level security).
- Horizontal scalability (the process cache and in-memory batchers assume single-instance or "close enough" consistency).
- A plugin ecosystem (the code is tightly coupled to its specific feature set).

---

## 5. 是否适合用于生产？

**Yes, for its intended use case: a single-author or small-team self-hosted blog.**

The author runs this in production at `yufan.me`. For that workload — a few posts per week, moderate traffic, single admin — the design is appropriate. The failure modes (stale cache for 10s, missing integration tests, heavy UI hook usage) don't matter at low scale.

**Do NOT use this for:**
- A multi-user SaaS blogging platform (no tenant isolation, no API rate limiting per-user, no resource quotas).
- A high-traffic site without Redis cluster and Postgres read replicas (the process cache and synchronous settings reads won't survive load).
- A compliance-critical deployment without adding a dedicated audit log sink (today audit events go to stdout; the `AGENTS.md` admits this is "placeholder behaviour").

---

## 6. 评分细则

| 维度 | 分数 | 说明 |
|------|------|------|
| 架构设计 | 8.0 / 10 | 边界清晰，分层严格，但 process cache 和 service 文件膨胀是结构性缺陷。 |
| 代码质量 | 7.5 / 10 | 类型安全优秀，命名一致，但 84 个 BigInt 转换点、102 个 `any` 在 server/、部分文件过长。 |
| 工程实践 | 8.0 / 10 | CI/CD、lint、测试覆盖率阈值、Docker 多阶段构建齐全，但缺少集成测试，mock 过重。 |
| 性能与风险 | 6.5 / 10 | 速率限制和审计日志优秀，但缓存一致性、XSS 风险面、chunk 体积、Node 25 是隐患。 |
| **总分** | **7.5 / 10** | **高水准的 indie CMS，接近生产级 SaaS 的门槛，但还没跨过去。** |

---

## 7. 优先修复清单 (If I Were Maintaining This)

1. **P0:** Replace `createProcessCache` with Redis-backed cache or add cross-process invalidation.
2. **P0:** Audit all `dangerouslySetInnerHTML` call sites; add server-side HTML sanitization tests with XSS payloads.
3. **P1:** Split `posts/service.ts` and `comments/service.ts` into per-use-case modules.
4. **P1:** Add integration tests that boot the real Hono app and hit real endpoints against a test database.
5. **P1:** Downgrade Node.js from 25 to 22 LTS.
6. **P2:** Replace manual `BigInt(input.id)` with a centralized ID parser (e.g., `decodeId(input.id): bigint`) and/or switch DB IDs to `uuid` / `nanoid`.
7. **P2:** Verify public bundle size; add `rollup-plugin-visualizer` to CI artifacts.
8. **P2:** Wrap multi-table writes in `db.transaction()` at the service layer.
9. **P3:** Remove `globalThis` singletons in favor of DI or context passing.
10. **P3:** Localize `env.ts` error message to English.

---

> *"Talk is cheap. Show me the code."* — This project shows the code, and most of it is competent. But competent isn't done. Fix the cache, fix the BigInt, add integration tests, and then we'll talk about 8.5/10.
