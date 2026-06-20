import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['react', 'jsx-a11y', 'react-perf', 'import', 'typescript', 'promise', 'node', 'unicorn', 'oxc'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    '.agents/skills/*',
    'drizzle/**/*',
    'tests/**/*',
    // Legacy editor files, will be deleted.
    'scripts/inkling-poc/*.ts',
    'scripts/inkling-poc/*.mjs',
    'src/ui/admin/editor/tiptap/**/*',
  ],
  settings: {
    react: {
      version: '19.2.5',
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
    // Per-rule settings below override this default. Rules explicitly set
    // to 'warn' (e.g. no-unsafe-type-assertion, which is codebase debt
    // tracked as warn) stay at 'warn' regardless of the category default.
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
    'typescript/prefer-optional-chain': 'off',
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
    'no-console': 'warn',
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
  },
})
