# oxlint Config Audit

Trigger: user asks to "audit lint rules", "补齐 lint 规则", "enable missing oxlint rules", "补全 oxlint 配置", or any request to align `oxlint.config.ts` with the latest oxlint rule set.

## Purpose

Find oxlint rules that are **supported by the oxlint version bundled with vite-plus** but **not yet enabled in `oxlint.config.ts`**, evaluate whether they are valuable for this project, enable them, and fix the resulting violations. This is a complete workflow — not just documentation.

> **Note:** This project does not install oxlint directly. Linting is invoked through `vp lint` (vite-plus), which bundles its own oxlint binary and plugins. Do not run `npx oxlint` or `node_modules/.bin/oxlint` directly — always use `vp lint` and forward flags with `vp lint -- <flags>`.

## Agent Protocol

When this skill is triggered, execute the following steps **in order**. Do not skip steps.

### Step 1 — Read current config

Use `ReadFile` on `oxlint.config.ts`. Extract all rule names currently present in the `rules:` object (including those set to `'off'`).

### Step 2 — Build candidate list

Compare the current config against the **Priority candidate table** below.

- **Skip** any rule already present in the config (regardless of level).
- **Skip** any rule listed in **Keep OFF**.
- **Skip** any plugin not loaded in `oxlint.config.ts` (this project loads: `react`, `jsx-a11y`, `react-perf`, `import`, `typescript`, `promise`, `node`, `unicorn`, `oxc`).

The remaining rules are the **proposed candidates**. Order them by priority: P0 first, then P1, P2, P3, P4.

### Step 3 — Gatekeeper review (NEW)

Before injecting any rule, evaluate each proposed candidate against the project's actual codebase and conventions. Ask: **"Will this rule catch real bugs in this project, or will it just create noise?"**

Reject rules that fail any of these checks:

1. **Already covered by TypeScript or `categories.correctness`** — If TypeScript's exhaustiveness checking or the `correctness` category already catches the issue, don't duplicate it.
2. **Conflicts with framework idioms** — React Router intentionally throws `redirect()` and `new Response()` from loaders. Rules like `only-throw-error` that flag these are not valuable here.
3. **Flags intentional, valuable patterns** — `== null` / `!= null` is an explicit project convention for null/undefined guards. `eqeqeq` should NOT be enabled if the only violations are this pattern.
4. **Too noisy for marginal value** — Context defaults (`() => {}`), test mocks, and standard library usage patterns (tiptap default imports) should not require 20+ manual fixes.
5. **Side-effect imports are explicit and intentional** — CSS imports (`import '@/assets/styles/admin.css'`) and TypeScript module augmentation (`import 'react-router'`) are standard, not accidents.

**Gatekeeper decision log format:** For each rejected rule, record:
- Rule name
- Reason for rejection
- Example of the intentional pattern it would flag

Only rules that **pass** the gatekeeper become the **final candidates** for Step 4.

### Step 4 — Batch enable & triage

For each priority group (P0, then P1, etc.), do:

1. **Backup**: `cp oxlint.config.ts oxlint.config.ts.bak`
2. **Inject**: Use `StrReplaceFile` to append all rules in this group to the `rules:` object at level `error`.
3. **Lint**: Run `vp lint 2>&1 | tee /tmp/oxlint-batch.txt`
4. **Parse**: Count how many violations are reported **for rules in this group**.
   - A simple heuristic: grep the rule name in `/tmp/oxlint-batch.txt` and count occurrences.
   - If parsing is unreliable, run `vp lint -- --format=unix 2>&1 | grep '<rule-name>' | wc -l` for each rule.
5. **Decide** per rule using the Decision table below.
6. **Fix** auto-fixable violations: `vp lint -- --fix` (this fixes all auto-fixable errors at once).
7. **Re-lint**: Run `vp lint` again to see remaining violations.
8. **Manual fix** remaining violations for rules kept at `error`, or downgrade to `warn` if too many.
9. **Verify**: Run `vp check` and `vp test run` before moving to the next priority group.
10. **Commit or revert**: If the batch is clean, keep it and delete the backup. If it broke tests, restore from backup and retry rules one-by-one.

### Step 5 — Cleanup

Remove any `.bak` files. Summarize:
- What was **enabled** (and at what level)
- What was **deferred to `warn`**
- What was **rejected by the gatekeeper** (with reasoning)
- What was **rejected after triage** (too many violations)

---

## Decision table

| Violations after `--fix` | Action |
|--------------------------|--------|
| 0 | Keep at `error`. |
| 1–10 | Fix manually in source files, then keep at `error`. |
| 11–50 | Downgrade to `warn` in config. Add a `// TODO: elevate to error after cleanup` comment above the rule. |
| 50+ | Remove the rule from config entirely. It is too noisy for the current codebase. |

**Special case — tests break after fixing:**
If `vp test run` fails because a lint fix changed runtime behavior (e.g. `eqeqeq` changing `== null` to `=== null` where `undefined` is possible):
1. Revert that specific source change.
2. Add an `oxlint-disable-next-line` comment with an explanation.
3. Keep the rule at `error` — the disable comment documents the intentional exception.

---

## Priority candidate table

These are rules the bundled oxlint supports but the project does NOT currently enable. Process them **in priority order** (P0 highest).

To see the full list of rules available in the current vite-plus bundle, run `vp lint -- --rules`.

### P0 — Suspicious (likely bugs, low noise)

| Rule | Suggested level | Why |
|------|-----------------|-----|
| `no-extend-native` | error | Never mutate built-in prototypes. Zero legitimate use case. |
| `no-unexpected-multiline` | error | ASI footguns. |
| `no-unmodified-loop-condition` | error | Infinite loops from never-updated conditions. |
| `no-named-as-default` | warn | Import name clashes with a non-default export. |
| `no-named-as-default-member` | warn | Import member name clashes with default export. |
| `no-commented-out-tests` | warn | Dead test code. |
| `consistent-return` | warn | Mixing `return` and `return value` in same function. |
| `no-extraneous-class` | warn | Classes with only static members → plain object. |
| `no-unnecessary-template-expression` | warn | `` `${x}` `` when `x` is already string. Auto-fixable. |
| `no-unnecessary-type-arguments` | warn | Redundant generic args. Auto-fixable. |
| `no-unnecessary-type-constraint` | warn | `T extends any` noise. Auto-fixable. |
| `no-unsafe-enum-comparison` | warn | Comparing enum values across different enums. |
| `no-instanceof-builtins` | warn | Use `Array.isArray` instead of `instanceof Array`. |

### P1 — Restriction (feature bans, check violation count first)

| Rule | Suggested level | Why |
|------|-----------------|-----|
| `no-var` | error | ESM + TS codebase should never use `var`. |
| `no-sequences` | error | Comma expressions `(a, b)` are almost always mistakes. |
| `prefer-node-protocol` | error | Use `node:fs` instead of `fs`. |
| `no-param-reassign` | warn | Reassigning function parameters. |
| `no-empty-function` | warn | Empty functions without explanatory comment. |
| `no-console` | warn | Warn on `console.log` in production code (keep `console.error`). |
| `catch-or-return` | warn | Unhandled Promise rejections. |
| `no-document-cookie` | error | Client code should use abstraction layer. |

### P2 — Pedantic (strict, enable incrementally)

| Rule | Suggested level | Why |
|------|-----------------|-----|
| `eqeqeq` | error | `===` everywhere. Auto-fixable. |
| `no-case-declarations` | error | `case` blocks need braces. |
| `no-throw-literal` | error | Only throw `Error` instances. |
| `prefer-ts-expect-error` | warn | `@ts-expect-error` over `@ts-ignore`. Auto-fixable. |
| `prefer-includes` | warn | `includes` over `indexOf !== -1`. Auto-fixable. |
| `return-await` | warn | Consistent `return await` inside try/catch. Auto-fixable. |
| `only-throw-error` | error | Same as `no-throw-literal` for TS. |

### P3 — Perf (performance)

| Rule | Suggested level | Why |
|------|-----------------|-----|
| `no-accumulating-spread` | warn | O(n^2) reduce+spread patterns. |
| `prefer-array-flat-map` | warn | `map(...).flat()` → `flatMap`. Auto-fixable. |
| `prefer-set-has` | warn | Use `Set.has` for repeated membership tests. |

### P4 — Import hygiene

| Rule | Suggested level | Why |
|------|-----------------|-----|
| `no-absolute-path` | warn | Absolute imports in source code. |
| `no-empty-named-blocks` | warn | `import {} from 'mod'` is useless. Auto-fixable. |
| `no-unassigned-import` | warn | Side-effect imports should be explicit. |

---

## Keep OFF (do not enable without explicit user approval)

| Rule | Reason |
|------|--------|
| `no-named-as-default` / `no-named-as-default-member` | 100% false positives: tiptap extensions and bcrypt use default imports by design; renaming would be non-idiomatic. |
| `no-shadow` | Too noisy in React hooks (`const [x, setX] = ...` shadows outer `x` in callbacks). |
| `no-underscore-dangle` | Drizzle uses `_` prefixes for internal columns; idiomatic. |
| `no-use-before-define` | Hoisted function declarations are valid here. |
| `complexity` / `max-lines` / `max-depth` | Architectural constraints live in AGENTS.md, not lint. |
| `no-empty` | Empty `catch` blocks are sometimes intentional. |
| `no-warning-comments` | `TODO` and `FIXME` are part of the workflow. |
| `ban-ts-comment` | `@ts-expect-error` is a valid tool. |
| `no-explicit-any` | Drizzle and ORM edges require `any` as escape hatch. |
| `strict-boolean-expressions` | Too noisy with React conditional rendering (`count && <div />`). |
| `require-await` | Async functions without await are sometimes intentional for interface conformance. |
| `no-else-return` / `no-negated-condition` / `no-lonely-if` | Personal style preference. |
| `prefer-readonly-parameter-types` | Too strict for practical React/TS codebase. |
| `jsx-filename-extension` / `prefer-function-component` | Already idiomatic; no enforcement needed. |
| `no-restricted-globals` / `no-restricted-properties` | No banned globals/properties in this project. |
| `no-async-client-component` / `google-font-*` / `next-script-for-ga` | Next.js-only rules. |
| `no-amd` / `no-commonjs` / `extensions` / `unambiguous` | ESM already enforced by `no-require-imports`. |
| `no-relative-parent-imports` | `src/server/` layers legitimately use `../` for sibling domain imports. |
| `no-dynamic-require` | No `require()` in the codebase at all. |
| `no-optional-chaining` / `no-rest-spread-properties` | Opposite of modern TS best practices. |
| `no-const-enum` | `const enum` is acceptable for small internal enums. |
| `no-barrel-file` | Barrel files are explicitly avoided via AGENTS.md convention. |
| `no-new-array` | `new Array(n)` is acceptable for pre-allocation. |
| `no-useless-length-check` | False positives in guard-clause patterns. |
| `prefer-array-find` | False positives with generic array iteration. |
| `no-process-exit` | Server code uses `process.exit` in startup error paths. |
| `prefer-modern-math-apis` | Not universally available. |
| `prefer-module` | Already ESM; no CJS files to migrate. |
| `no-array-reduce` | `reduce` is idiomatic for accumulator transforms. |
| `no-array-for-each` | `forEach` is acceptable for side-effect-only iterations. |
| `no-immediate-mutation` | False positives with immutable patterns. |
| `new-for-builtins` | `new Map()` is valid and distinct from `Map()`. |
| `prefer-blob-reading-methods` | Not relevant to this project's browser surface. |
| `prefer-dom-node-append` / `prefer-dom-node-remove` | React manages DOM; direct DOM manipulation is rare. |
| `prefer-event-target` | Not relevant. |
| `prefer-native-coercion-functions` | Too pedantic. |
| `no-required-prop-with-default` / `require-default-export` / `max-props` / `no-import-compiler-macros` / `no-multiple-slot-args` / `no-arrow-functions-in-watch` / `no-deprecated-*` / `no-export-in-script-setup` / `no-lifecycle-after-await` / `no-this-in-before-route-enter` / `prefer-import-from-vue` / `return-in-computed-property` / `valid-define-emits` / `valid-define-props` | Vue-only rules. |
| `consistent-each-for` / `hoisted-apis-on-top` / `no-conditional-tests` / `require-awaited-expect-poll` / `require-local-test-context-for-concurrent-snapshots` / `require-mock-type-parameters` / `warn-todo` / `expect-expect` / `no-conditional-expect` / `no-disabled-tests` / `no-export` / `no-focused-tests` / `no-standalone-expect` / `prefer-snapshot-hint` / `require-to-throw-message` / `valid-describe-callback` / `valid-expect` / `valid-expect-in-promise` / `valid-title` | Jest/Vitest test-style rules -- not enabled to avoid noise in test files. |

---

## Fix strategy by rule

When a rule produces violations that are NOT auto-fixable, use these patterns:

### `eqeqeq`
- Replace `==` with `===`.
- Exception: `== null` is acceptable as shorthand for `=== null \|\| === undefined`. If oxlint complains about `== null`, add an `oxlint-disable-next-line` comment.

### `no-var`
- Replace `var` with `const` (if never reassigned) or `let` (if reassigned).
- Check for closure-capture gotchas in loops (`for (var i = 0; i < n; i++)` with async callbacks).

### `prefer-node-protocol`
- Replace `import fs from 'fs'` with `import fs from 'node:fs'`.

### `no-param-reassign`
- Copy the parameter to a local variable: `let localX = x; localX += 1`.
- Exception: Redux-style reducer mutations of `draft` in Immer are not applicable here (no Immer).

### `no-sequences`
- Split comma expressions into separate statements.
- Exception: `for` loop increments like `(i++, j++)` — refactor to two loops or a compound variable.

### `no-console`
- Replace `console.log` with the logger from `@/server/infra/logger` in server code.
- In client code, replace with `console.warn` or `console.error` if it is actually an error; otherwise remove.
- In tests, `console.log` is acceptable — add test files to the rule's ignore list or keep the rule at `warn`.

### `consistent-return`
- Ensure every code path in a function returns the same type (or `undefined`).
- Add explicit `return undefined` at the end of functions that sometimes return a value.

### `no-throw-literal` / `only-throw-error`
- Replace `throw 'message'` with `throw new Error('message')`.
- Replace `throw errOrNull` with `if (errOrNull) throw errOrNull` or wrap in `new Error()`.

### `prefer-ts-expect-error`
- Replace `@ts-ignore` with `@ts-expect-error` when the suppression is expected to be temporary.
- If the suppression is permanent (e.g. third-party type mismatch), keep `@ts-ignore` and add an `oxlint-disable-next-line` comment.

### `return-await`
- Add `await` to `return somePromise()` inside `try/catch/finally` blocks so the catch handler can catch rejections.
- Inside `try` blocks where the function is already async, `return await x` vs `return x` changes stack trace behavior — prefer `return await x` for clarity.

### `no-document-cookie`
- Client code should use the cookie abstraction in `@/client/*` (if any) or avoid direct `document.cookie` access.

### `no-unnecessary-template-expression`
- Remove backticks when the template literal contains no expressions or only a single string variable.

### `no-unnecessary-type-arguments`
- Remove explicit generic arguments when TypeScript can infer them (e.g. `Promise.resolve<string>(x)` when `x` is already `string`).

### `no-unnecessary-type-constraint`
- Remove `extends any` from generic parameters.

### `no-instanceof-builtins`
- Replace `instanceof Array` with `Array.isArray()`.
- Replace `instanceof Object` with `typeof x === 'object' && x !== null`.

---

## Safety & rollback

- Always keep `oxlint.config.ts.bak` until `vp check` and `vp test run` pass.
- If a rule causes >50 violations and is not in the Priority table, it belongs in "Keep OFF" — revert it.
- If fixing a rule introduces a runtime behavior change (e.g. `eqeqeq` changing `== null` to `=== null` where `undefined` is possible), add a unit test for that edge case before committing.
- Never commit a lint config change that breaks `vp check`.

## Last audited

2026-05-21 — Added Step 3 Gatekeeper review. Updated to clarify oxlint is bundled with vite-plus, not installed directly.
