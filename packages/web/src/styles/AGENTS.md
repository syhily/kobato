# Web style conventions

`packages/web/src/styles/` owns product-component Tailwind compilation and Kobato-specific editor adapters. Every entry scans only `packages/web`.

- `public.css` compiles `ui/public` and owns public zoom/comment-flash rules. `admin.css` compiles `ui/admin` and the public modules admin deliberately renders (`ui/public/music-player`, `ui/public/chrome`, the comment editor surface under `ui/public/comments`, `ui/public/widgets`, `Search`), and owns admin zoom/scrollbar rules. Neither entry scans `client/` — the platform layer carries no product styles.
- Both entries reference UI's token contract without re-emitting it. Their `@source` paths never leave web.
- `inkling-editor.css` is imported with Inkling's own `index.css` by `PageBodyEditor`; `inkling-comment-editor.css` follows the same composition in `CommentBodyEditor`. Web owns only unlayered host rules.
- The page canvas uses `zoom: 2/3`, token/spacing bridges, and host-card token restores. The comment canvas has no zoom because it breaks contenteditable IME painting.
- Inkling owns its own preflight, dark variant, layer, utilities, and source scan. Web never imports Inkling's sheet through another Tailwind compile and never scans Inkling sources.
- Contracts: `packages/web/tests/contract/editor-canvas-scope.test.ts`, `editor-host-card-tokens.test.ts`, and the app-level `tailwind-source-ownership.test.ts`.
