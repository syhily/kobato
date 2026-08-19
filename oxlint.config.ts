import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['react', 'jsx-a11y', 'react-perf', 'import', 'typescript', 'promise', 'node', 'unicorn', 'oxc'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  ignorePatterns: ['.agents/skills/*', 'drizzle/**/*'],
  settings: {
    react: {
      // Keep aligned with the installed `react` version in package.json —
      // oxlint has no "detect" option, and a stale baseline silently
      // evaluates version-gated rules against the wrong React.
      version: '19.2.8',
      formComponents: [{ name: 'Form', attribute: 'action' }],
      linkComponents: [
        { name: 'Link', attribute: 'to' },
        { name: 'NavLink', attribute: 'to' },
      ],
    },
    'jsx-a11y': {
      components: {
        Form: 'form',
        Image: 'img',
        Icon: 'svg',
      },
    },
  },
  options: {
    reportUnusedDisableDirectives: 'warn',
    typeAware: true,
    typeCheck: true,
  },
  categories: {
    correctness: 'error',
  },
  rules: {
    curly: 'error',
    'no-unused-vars': 'error',

    // Module boundaries and imports.
    'import/default': 'error',
    'import/no-namespace': 'error',
    'import/no-cycle': 'warn',
    'import/no-duplicates': 'error',
    'import/no-self-import': 'error',
    'import/no-webpack-loader-syntax': 'error',
    // Mutable named exports break tree-shaking and confuse module consumers.
    'import/no-mutable-exports': 'error',
    // Empty named import blocks are a code smell and confuse bundlers.
    'import/no-empty-named-blocks': 'error',
    // Project explicitly avoids barrel files (bundle-barrel-imports).
    'oxc/no-barrel-file': 'error',

    // Promise / async correctness. Fire-and-forget work should be written as
    // `void task().catch(...)` so the intent is visible to reviewers and lint.
    'promise/no-callback-in-promise': 'error',
    'promise/no-multiple-resolved': 'error',
    'promise/no-promise-in-callback': 'off',
    'promise/no-return-in-finally': 'error',
    'promise/always-return': 'off',

    // Oxc performance lints.
    'oxc/no-accumulating-spread': 'warn',

    // React Compiler — oxlint 1.79 split the single `react/react-compiler` rule
    // into per-category rules. Keep the violation categories at `error` and
    // leave the bailout/meta categories (rule-suppression, syntax, todo,
    // unsupported-syntax, invariant) off, matching the old rule's default
    // (`reportAllBailouts: false`).
    'react/error-boundaries': 'error',
    'react/globals': 'error',
    'react/immutability': 'error',
    'react/incompatible-library': 'error',
    'react/preserve-manual-memoization': 'error',
    'react/purity': 'error',
    'react/refs': 'error',
    'react/set-state-in-effect': 'error',
    'react/set-state-in-render': 'error',
    'react/static-components': 'error',
    'react/use-memo': 'error',
    'react/void-use-memo': 'error',
    'react/capitalized-calls': 'error',
    'react/exhaustive-effect-dependencies': 'warn',
    'react/hooks': 'error',
    'react/memo-dependencies': 'error',
    'react/no-deriving-state-in-effects': 'error',

    // React and React Hooks.
    'react/exhaustive-deps': 'warn',
    'react/rules-of-hooks': 'error',
    'react/button-has-type': 'error',
    'react/checked-requires-onchange-or-readonly': 'error',
    'react/jsx-no-comment-textnodes': 'error',
    'react/jsx-key': 'error',
    'react/jsx-no-duplicate-props': 'error',
    'react/jsx-no-script-url': 'error',
    'react/jsx-no-target-blank': 'error',
    'react/jsx-no-undef': 'error',
    'react/no-children-prop': 'error',
    'react/no-danger-with-children': 'error',
    'react/no-unknown-property': 'error',
    'react/react-in-jsx-scope': 'off',
    'react/style-prop-object': 'error',
    'react/void-dom-elements-no-children': 'error',
    // Legacy guard. Zero violations today; cheap insurance against a
    // tutorial-copy slipping `ref="..."` (string ref) into modern code.
    'react/no-string-refs': 'error',
    // `posts.map((p, i) => <Card key={i} />)` survives an insert but
    // shuffles state on a delete. Default to stable keys. Existing
    // backlog (~22 sites) is `warn` for incremental cleanup.
    'react/no-array-index-key': 'warn',
    // Constructing a new object/array as Context value causes unnecessary
    // re-renders for all consumers on every render.
    'react/jsx-no-constructed-context-values': 'warn',

    // TypeScript rules that catch runtime bugs without forcing noisy style preferences.
    'typescript/await-thenable': 'error',
    'typescript/no-array-delete': 'error',
    'typescript/no-confusing-void-expression': 'off',
    'typescript/no-deprecated': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-for-in-array': 'error',
    'typescript/no-implied-eval': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-non-null-asserted-optional-chain': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-unnecessary-type-assertion': 'off',
    'typescript/no-unsafe-argument': 'warn',
    'typescript/no-unsafe-assignment': 'warn',
    'typescript/no-unsafe-call': 'warn',
    'typescript/no-unsafe-member-access': 'warn',
    'typescript/no-unsafe-return': 'warn',
    'typescript/no-unsafe-type-assertion': 'warn',
    'typescript/prefer-nullish-coalescing': 'off',
    'typescript/prefer-optional-chain': 'warn',
    // tsgolint v7 stable audit (type-aware). Zero-violation guards are locked
    // as errors; small backlogs drain incrementally as warnings. The noisy or
    // stylistic survivors (prefer-readonly-parameter-types,
    // no-unnecessary-condition, strict-void-return, consistent-return) stay off.
    'typescript/consistent-type-exports': 'error',
    'typescript/no-unnecessary-qualifier': 'error',
    'typescript/prefer-find': 'error',
    'typescript/prefer-readonly': 'warn',
    'typescript/dot-notation': 'warn',
    'typescript/no-unnecessary-type-parameters': 'warn',
    'typescript/prefer-regexp-exec': 'warn',
    'typescript/no-unnecessary-type-conversion': 'warn',
    'typescript/restrict-plus-operands': 'warn',
    // `${obj}` silently produces `"[object Object]"`. Caught us once in a
    // log line; the cost of locking it down is zero today.
    'typescript/no-base-to-string': 'error',
    // Spreading a non-iterable / Map / Set into an array or object produces
    // surprising shapes. Rule has no current violations.
    'typescript/no-misused-spread': 'error',
    // Tagged-union exhaustiveness on `'post' | 'page'` discriminators and
    // PortableText block types. 7 sites today are missing default branches;
    // warn lets the backlog drain without blocking.
    'typescript/switch-exhaustiveness-check': 'warn',
    // Discourage blind @ts-ignore; @ts-expect-error is preferred.
    'typescript/ban-ts-comment': 'warn',
    // Clean up unnecessary template-literal wrapping of plain expressions.
    'typescript/no-unnecessary-template-expression': 'warn',

    // React Router and SSR routes intentionally forward props and render trusted HTML.
    'react/jsx-props-no-spread-multi': 'off',
    // Each call site of dangerouslySetInnerHTML is individually audited
    // and documented as safe (admin-only surfaces or pre-sanitized output).
    // Turning the rule off globally avoids noise; new call sites must be
    // reviewed manually.
    'react/no-danger': 'off',

    // Existing templates use progressive-enhancement hooks that are noisy with generic a11y heuristics.
    'jsx_a11y/click-events-have-key-events': 'off',
    'jsx_a11y/no-static-element-interactions': 'off',
    'react_perf/jsx-no-new-array-as-prop': 'off',
    'react_perf/jsx-no-new-function-as-prop': 'off',
    'react_perf/jsx-no-new-object-as-prop': 'off',

    // Server modules intentionally read the validated env facade instead of raw process.env.
    'node/no-process-env': 'off',

    // Catch `module.exports = ...` slipping into an ESM file.
    'node/no-exports-assign': 'error',

    // Throw hygiene + the silent-await-in-Promise.all() footgun.
    'unicorn/error-message': 'error',
    'unicorn/throw-new-error': 'error',
    'unicorn/no-await-in-promise-methods': 'error',
    // `await foo.bar.baz` parses as `(await foo).bar.baz` only when the
    // expression starts with await — surprising in property-chain reads.
    'unicorn/no-await-expression-member': 'warn',
    // Avoid converting an iterator to an array when the array is immediately
    // consumed by a method that works on iterators (e.g. `.map`, `.filter`).
    'unicorn/no-useless-iterator-to-array': 'warn',

    // P0 — Suspicious (likely bugs, low noise).
    'no-extend-native': 'error',
    'no-unexpected-multiline': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-commented-out-tests': 'warn',
    'no-extraneous-class': 'warn',
    'no-unnecessary-type-arguments': 'warn',
    'no-unnecessary-type-constraint': 'warn',
    'no-unsafe-enum-comparison': 'warn',
    'no-instanceof-builtins': 'warn',

    // P1 — Restriction (feature bans).
    'no-var': 'error',
    'no-sequences': 'error',
    'prefer-node-protocol': 'error',
    'no-param-reassign': 'warn',
    'no-empty-function': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'promise/catch-or-return': 'warn',
    'no-document-cookie': 'error',

    // P2 — Pedantic (strict, incremental).
    'no-throw-literal': 'error',
    'no-case-declarations': 'error',
    'prefer-ts-expect-error': 'error',
    'prefer-includes': 'warn',
    'return-await': 'warn',

    // P3 — Perf.
    'prefer-array-flat-map': 'warn',
    'prefer-set-has': 'warn',

    // P4 — Import hygiene.
    'no-absolute-path': 'warn',

    // A11y additions. Both are zero-violation guards against empty headings
    // and broken `<a>` (`href="#"` or missing href).
    'jsx-a11y/heading-has-content': 'error',
    'jsx-a11y/anchor-is-valid': 'error',
    // Project uses custom CSS-animated popups instead of native <dialog> to
    // avoid browser default positioning/backdrop styling.
    'jsx-a11y/prefer-tag-over-role': 'off',

    // ── oxlint 1.78 rule audit ─────────────────────────────────────────────
    // Every disabled rule from the installed plugins was trial-enabled against
    // the repo; the tiers below are the survivors. Tier 1 fired zero times, so
    // they are locked as errors — pure guards against future regressions.

    // Tier 1 (zero violations) — eslint core.
    'accessor-pairs': 'error',
    'block-scoped-var': 'error',
    'max-nested-callbacks': 'error',
    'no-alert': 'error',
    'no-array-constructor': 'error',
    'no-constructor-return': 'error',
    'no-div-regex': 'error',
    'no-extra-bind': 'error',
    'no-fallthrough': 'error',
    'no-implicit-globals': 'error',
    'no-inner-declarations': 'error',
    'no-loop-func': 'error',
    'no-new-wrappers': 'error',
    'no-object-constructor': 'error',
    'no-proto': 'error',
    'no-prototype-builtins': 'error',
    'no-redeclare': 'error',
    'no-self-compare': 'error',
    'no-unneeded-ternary': 'error',
    'no-useless-call': 'error',
    'no-useless-constructor': 'error',
    'prefer-promise-reject-errors': 'error',
    'symbol-description': 'error',
    'unicode-bom': 'error',

    // Tier 1 — import / node / oxc / promise.
    'import/no-amd': 'error',
    'import/no-commonjs': 'error',
    'import/no-dynamic-require': 'error',
    'node/handle-callback-err': 'error',
    'node/no-new-require': 'error',
    'node/no-path-concat': 'error',
    'oxc/approx-constant': 'error',
    'oxc/bad-bitwise-operator': 'error',
    'oxc/misrefactored-assign-op': 'error',
    'oxc/no-async-endpoint-handlers': 'error',
    'oxc/no-const-enum': 'error',
    'oxc/no-this-in-exported-function': 'error',
    'promise/spec-only': 'error',

    // Tier 1 — react / a11y.
    'react/iframe-missing-sandbox': 'error',
    'react/no-clone-element': 'error',
    'react/no-unescaped-entities': 'error',
    'react/prefer-function-component': 'error',
    'jsx_a11y/anchor-ambiguous-text': 'error',

    // Tier 1 — typescript.
    'typescript/no-confusing-non-null-assertion': 'error',
    'typescript/no-mixed-enums': 'error',
    'typescript/no-non-null-asserted-nullish-coalescing': 'error',
    'typescript/no-var-requires': 'error',
    'typescript/prefer-enum-initializers': 'error',
    'typescript/prefer-literal-enum-member': 'error',
    'typescript/related-getter-setter-pairs': 'error',

    // Tier 1 — unicorn.
    'unicorn/consistent-assert': 'error',
    'unicorn/consistent-empty-array-spread': 'error',
    'unicorn/no-abusive-eslint-disable': 'error',
    'unicorn/no-accessor-recursion': 'error',
    'unicorn/no-anonymous-default-export': 'error',
    'unicorn/no-array-fill-with-reference-type': 'error',
    'unicorn/no-confusing-array-with': 'error',
    'unicorn/no-instanceof-array': 'error',
    'unicorn/no-length-as-slice-end': 'error',
    'unicorn/no-magic-array-flat-depth': 'error',
    'unicorn/no-negation-in-equality-check': 'error',
    'unicorn/no-new-buffer': 'error',
    'unicorn/no-static-only-class': 'error',
    'unicorn/no-this-assignment': 'error',
    'unicorn/no-unnecessary-array-flat-depth': 'error',
    'unicorn/no-unnecessary-array-splice-count': 'error',
    'unicorn/no-unnecessary-slice-end': 'error',
    'unicorn/no-unreadable-iife': 'error',
    'unicorn/no-useless-error-capture-stack-trace': 'error',
    'unicorn/prefer-array-find': 'error',
    'unicorn/prefer-array-flat': 'error',
    'unicorn/prefer-array-some': 'error',
    'unicorn/prefer-blob-reading-methods': 'error',
    'unicorn/prefer-date-now': 'error',
    'unicorn/prefer-modern-math-apis': 'error',
    'unicorn/prefer-prototype-methods': 'error',
    'unicorn/require-module-specifiers': 'error',
    'unicorn/require-number-to-fixed-digits-argument': 'error',

    // Tier 2 — small backlogs (≤10 sites each, 63 total at adoption); warn
    // lets them drain without blocking, same policy as no-array-index-key.
    'array-callback-return': 'warn',
    'no-else-return': 'warn',
    'no-empty': 'warn',
    'no-useless-concat': 'warn',
    'no-useless-return': 'warn',
    'preserve-caught-error': 'warn',
    radix: 'warn',
    'oxc/branches-sharing-code': 'warn',
    'oxc/no-map-spread': 'warn',
    'react/no-unstable-nested-components': 'warn',
    'typescript/ban-types': 'warn',
    'typescript/no-empty-object-type': 'warn',
    'typescript/no-invalid-void-type': 'warn',
    'typescript/no-unsafe-function-type': 'warn',
    'unicorn/new-for-builtins': 'warn',
    'unicorn/no-array-reverse': 'warn',
    'unicorn/no-typeof-undefined': 'warn',
    'unicorn/no-useless-promise-resolve-reject': 'warn',
    'unicorn/no-useless-switch-case': 'warn',
    'unicorn/prefer-regexp-test': 'warn',
    'unicorn/prefer-type-error': 'warn',
  },
  overrides: [
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx'],
      rules: {
        // Test code gets a deliberately lighter rule set: mocks, fixtures,
        // and deliberately-awkward components make the type-aware unsafe
        // family and friends fire constantly without finding real bugs.
        // oxlint overrides cannot disable whole categories — only named
        // rules — so the noisy offenders are listed explicitly.
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
        // Mocked contexts and sync test doubles are routinely awaited.
        'typescript/await-thenable': 'off',
        // Tests intentionally pin the behavior of deprecated APIs.
        'typescript/no-deprecated': 'off',
        // Fire-and-forget calls are normal in tests.
        'typescript/no-floating-promises': 'off',
        // Fixture objects stringified for assertions.
        'typescript/no-base-to-string': 'off',
        // `expect(mock.method)` reads are how vitest assertions work.
        'typescript/unbound-method': 'off',
        // `vi.fn()` stubs and empty lifecycle hooks.
        'no-empty-function': 'off',
        // Mock helper classes with no state.
        'no-extraneous-class': 'off',
        // `(await foo).bar` chains are idiomatic in assertions.
        'unicorn/no-await-expression-member': 'off',
        // Mock thenables used to drive async code paths.
        'unicorn/no-thenable': 'off',
        // Fixture components deliberately break compiler rules.
        'react/error-boundaries': 'off',
        'react/globals': 'off',
        'react/immutability': 'off',
        'react/incompatible-library': 'off',
        'react/preserve-manual-memoization': 'off',
        'react/purity': 'off',
        'react/refs': 'off',
        'react/set-state-in-effect': 'off',
        'react/set-state-in-render': 'off',
        'react/static-components': 'off',
        'react/use-memo': 'off',
        'react/void-use-memo': 'off',
        'react/capitalized-calls': 'off',
        'react/exhaustive-effect-dependencies': 'off',
        'react/hooks': 'off',
        'react/memo-dependencies': 'off',
        'react/no-deriving-state-in-effects': 'off',
        // Fixture markup with placeholder roles.
        'jsx-a11y/aria-role': 'off',
        // Wildcard imports of schemas/helpers are idiomatic in tests.
        'import/no-namespace': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts'],
      rules: {
        // Plain-node build scripts (executed directly with `node
        // scripts/...`, type-stripped at runtime). Console output is the
        // scripts' UI, and the JSON/subprocess boundaries (JSON.parse, pg
        // rows) keep the unsafe-* family off. Non-type-aware rules still
        // apply.
        'no-console': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/restrict-template-expressions': 'off',
      },
    },
  ],
})
