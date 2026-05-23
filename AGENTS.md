# Project conventions

Repository conventions for AI agents and contributors.

## Quick orientation

- React Router 7 Framework Mode with SSR (`appDirectory: 'src'`). Vite builds.
- React 19 TSX/TS only.
- Postgres + Redis.
- Path alias `@/*` → `./src/*`.
- Five layers under `src/`: `routes/` (orchestration), `server/` (SSR),
  `client/` (browser), `ui/` (components), `shared/` (isomorphic).

## Subdirectory conventions

Claude loads these additively as it moves through the codebase:

| File                          | Scope                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| `src/routes/AGENTS.md`        | Route modules, loaders, actions, React Router conventions          |
| `src/server/AGENTS.md`        | Server layers (infra, domains, http, render), API procedures, auth |
| `src/client/AGENTS.md`        | Browser hooks, oRPC client, React.lazy patterns                    |
| `src/ui/AGENTS.md`            | Pure-props components, shadcn, PT renderer, component architecture |
| `src/assets/styles/AGENTS.md` | Tailwind tokens, design-system CSS, `@theme` conventions           |
| `src/shared/AGENTS.md`        | Isomorphic modules, Zod contracts, DTOs, PT schema                 |
| `tests/AGENTS.md`             | Test utilities, naming conventions, coverage rules                 |

## Skills

Conventions below are calibrated against the agent Skills under
`.agents/skills/`. Open SKILL.md and any referenced rule files _before_
writing code when a task triggers one:

| Skill                         | Triggers                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `react-router-framework-mode` | Routes, loaders, actions, forms, navigation, `react-router.config.ts`          |
| `vercel-react-best-practices` | Any React/SSR code. The 70 numbered rules are the performance baseline.        |
| `vercel-composition-patterns` | New components, boolean-prop matrices, compound components, context providers. |
| `shadcn`                      | shadcn/ui components, presets, `components.json`.                              |
| `tailwind-design-system`      | CSS tokens, design-system primitives, Tailwind v4 `@theme` changes.            |
| `web-design-guidelines`       | UI accessibility, UX, Web Interface Guidelines compliance.                     |
| `privacy-logging`             | Log output, audit events, error handling that touches user data.               |

Skills win on conflict. Quote stable rule ids in PR review (e.g.
`bundle-barrel-imports`, `architecture-avoid-boolean-props`,
`server-no-shared-module-state`).

## Build & CI

- `npm run dev`, `npm run fmt:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, `npm run build`
- Before committing: `npm run fmt:check && npm run lint && npm run typecheck`,
  `npm run test`, `npm run build`

## Git

- Semantic commits in English: `feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`
- Imperative mood, lowercase subject, no trailing period.
- Do not create commits unless explicitly asked.

## Defensive constraints

Do not reintroduce:

- No `src/actions`, `src/middleware`, `src/layouts`, `src/services`,
  `src/hooks`, `src/db`, `src/assets/scripts`, or `src/content/`.
- No `src/blog.config.ts`, `DEFAULT_SETTINGS`, `BlogConstants`, or
  per-section "reset to defaults" action.
- No monolithic `BlogConfigContext`/`<BlogConfigProvider>`. Use
  per-section hooks.
- No `data-admin-shell` selector.
- No `src/lib/` parallel to `@/ui/lib`.
- No `@/ui/admin/shadcn/components/ui/` nesting.
- Preserve public URLs, feed URLs, image endpoints, WordPress
  compatibility routes, and pagination routes unless explicitly asked to
  change them.
- `*.server.ts` suffix is redundant inside `src/server/`.

`src/assets/scripts` is intentionally absent. All interactivity lives in
React hooks/components under `src/client/` and `src/ui/`.

## Layering

- `server/*` may import `shared/*` and other `server/*`. Not `client/*`
  or `ui/*`.
- `client/*` and `ui/*` may import `shared/*`, `ui/*`, `client/*`. Not
  any `server/*` module or `.server.*` file.
- `shared/*` imports `shared/*` only.
- `routes/*` may import from any layer; route components must accept
  plain props.
- Avoid barrel `index.ts` files (`bundle-barrel-imports`).
- Do not use inline `import('module').Type` syntax for type annotations;
  always import types at the top of the file (`import type { Type }`).
- Refactor from architectural correctness, not minimal diff size. Necessary
  structural changes are encouraged even when they touch many files. Mitigate
  risk by adding tests before refactoring, not by avoiding the refactor.

Skill rules reviewers cite: `server-no-shared-module-state`,
`server-cache-react`, `bundle-analyzable-paths`, `bundle-dynamic-imports`,
`rendering-resource-hints`, `rerender-memo`.
