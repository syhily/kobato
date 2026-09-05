import { defineConfig } from 'oxlint'

// Aligned to /Users/Yufan/Developer/Business/syhily/kobato/oxlint.config.ts.
//
// INKLING ADAPTATIONS (reasons):
//  - oxc/no-barrel-file        : src/index.ts is a public barrel (package API).
//  - react formComponents/linkComponents + jsx-a11y component mappings :
//    no React Router Form/Link or Image/Icon wrappers in src.
//  - node/no-process-env       : not a server (already off in kobato too).
//  - react/no-array-index-key stays 'warn' (backlog), as in kobato.
//  - scripts/**/*.ts override mirrors kobato's (plain-node build scripts,
//    type-stripped at runtime; console output is the scripts' UI).
export default defineConfig({
  plugins: ['react', 'jsx-a11y', 'react-perf', 'import', 'typescript', 'promise', 'node', 'unicorn', 'oxc'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'node_modules/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.pnpm/**',
    '**/*.min.js',
    'pnpm-lock.yaml',
    '**/*.html',
    'storybook-static/**',
    // Packed-consumer type fixtures: they self-import '@inkling/editor'
    // (resolves to dist via package exports), so the type-aware gate cannot
    // see them without a build first — and their real gate is
    // scripts/verify-packed-types.ts, which type-checks them against the
    // packed tarball, @ts-expect-error directives included.
    'test/typecheck-consumer/**',
  ],
  settings: {
    react: {
      version: '19.2.7',
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
    'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],

    // Module boundaries and imports.
    'import/default': 'error',
    'import/no-namespace': 'error',
    'import/no-duplicates': 'error',
    'import/no-self-import': 'error',
    'import/no-webpack-loader-syntax': 'error',
    // Mutable named exports break tree-shaking and confuse module consumers.
    'import/no-mutable-exports': 'error',
    // Empty named import blocks are a code smell and confuse bundlers.
    'import/no-empty-named-blocks': 'error',
    // Off: src/index.ts is the package's public barrel (see header note).
    'oxc/no-barrel-file': 'off',
    // Off: Lexical's editor/node module graph is intentionally cyclic; the
    // layering that matters is pinned by test/unit/nodes/card-layering-imports.test.ts.
    'import/no-cycle': 'off',

    // Promise / async correctness. Fire-and-forget work should be written as
    // `void task().catch(...)` so the intent is visible to reviewers and lint.
    'promise/no-callback-in-promise': 'error',
    'promise/no-multiple-resolved': 'error',
    'promise/no-promise-in-callback': 'off',
    'promise/no-return-in-finally': 'error',
    'promise/always-return': 'off',

    // Oxc performance lints.
    'oxc/no-accumulating-spread': 'warn',

    // React Compiler — lint-only diagnostics matching eslint-plugin-react-compiler.
    'react/react-compiler': 'error',

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
    // `items.map((item, i) => <Card key={i} />)` survives an insert but
    // shuffles state on a delete. Default to stable keys. Existing
    // backlog is `warn` for incremental cleanup.
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
    'typescript/prefer-optional-chain': 'off',
    'typescript/restrict-plus-operands': 'warn',
    // `${obj}` silently produces `"[object Object]"`. Caught us once in a
    // log line; the cost of locking it down is zero today.
    'typescript/no-base-to-string': 'error',
    // Spreading a non-iterable / Map / Set into an array or object produces
    // surprising shapes.
    'typescript/no-misused-spread': 'error',
    // Tagged-union exhaustiveness. Warn lets the backlog drain without blocking.
    'typescript/switch-exhaustiveness-check': 'warn',
    // Discourage blind @ts-ignore; @ts-expect-error is preferred.
    'typescript/ban-ts-comment': 'warn',
    // Clean up unnecessary template-literal wrapping of plain expressions.
    'typescript/no-unnecessary-template-expression': 'warn',
    // Inkling keeper: `any` is banned outright in src; the unsafe-* family
    // above (warn) catches the boundaries that slip through typed surfaces.
    'typescript/no-explicit-any': 'error',
    // Lexical DecoratorNode subclasses intentionally use class+interface merging.
    'typescript/no-unsafe-declaration-merging': 'off',

    // Inkling ships editor chrome with custom interactions; generic a11y
    // heuristics are noisy against the card/popup surfaces.
    'jsx_a11y/click-events-have-key-events': 'off',
    'jsx_a11y/no-static-element-interactions': 'off',
    'jsx_a11y/no-autofocus': 'off',
    'jsx_a11y/no-noninteractive-element-interactions': 'off',
    'jsx_a11y/no-noninteractive-element-to-interactive-role': 'off',
    'jsx_a11y/control-has-associated-label': 'off',
    'jsx_a11y/mouse-events-have-key-events': 'off',
    'jsx_a11y/no-noninteractive-tabindex': 'off',
    'jsx_a11y/label-has-associated-control': 'off',
    // Project uses custom CSS-animated popups instead of native <dialog> to
    // avoid browser default positioning/backdrop styling.
    'jsx-a11y/prefer-tag-over-role': 'off',
    // Zero-violation guards against empty headings and broken `<a>`.
    'jsx-a11y/heading-has-content': 'error',
    'jsx-a11y/anchor-is-valid': 'error',
    'react_perf/jsx-no-new-array-as-prop': 'off',
    'react_perf/jsx-no-new-function-as-prop': 'off',
    'react_perf/jsx-no-new-object-as-prop': 'off',

    // Not a server; demo/scripts read process.env directly.
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

    // Inkling keepers (from prior config, stricter than kobato defaults).
    eqeqeq: ['error', 'always'],
    'no-eval': 'error',
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    'no-useless-call': 'error',
    'array-callback-return': 'error',
    'no-constructor-return': 'error',
    'no-promise-executor-return': 'error',
    'typescript/dot-notation': 'error',
    'unicorn/no-empty-file': 'off',
    'unicorn/no-invalid-remove-event-listener': 'warn',
    'no-control-regex': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.ts', 'test/**/*.tsx'],
      rules: {
        // Test bodies reassign describe-scoped `let` bindings and read refs
        // freely by design (kobato does not lint its tests at all); the
        // compiler's component-purity rules do not apply to test harnesses.
        'react/react-compiler': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts'],
      rules: {
        // Plain-node build scripts (executed directly with `node
        // scripts/...`, type-stripped at runtime). Console output is the
        // scripts' UI, and the JSON/subprocess boundaries keep the unsafe-*
        // family off. Non-type-aware rules still apply.
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
