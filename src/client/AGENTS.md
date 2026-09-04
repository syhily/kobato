# Client conventions

`src/client/` is browser-only. May import from `shared/` and other `client/`. Must not import any `server/` module or Node-only API.

## Structure

- `hooks/` — browser hooks. Admin file uploads go through `useFileUpload` (`@/client/hooks/use-file-upload`): it owns the CSRF read, accept/size guards, FormData POST, error unwrap, and toast choreography. Never hand-roll a fetch upload in a view.
- `editor/` — inkling editor host glue. `editor/cards/` holds the R10 host-card assemblies (solution / two-column / music-player): each module builds its base node class from the shared spec (`@/shared/lexical/cards/`) through the `.` entry's `generateDecoratorNode` — a DISTINCT class object from the server projection's, since each dist entry ships its own Lexical copy — then registers it via top-level `defineCard`. The decorate chrome components and the exportDOM markup share the spec's class/copy constants; `tests/unit/client/editor/cards/` pins that parity (the WYSIWYG gate).
- `api/` — oRPC client. All RPC calls go through `orpc.<domain>.<endpoint>(flatInput)` from `@/client/api/client`; server errors arrive as `ORPCError` rejections. TanStack Query wrappers live in `@/client/api/orpc-query`. Every public-site read flows through oRPC end to end: browser-side interactions use this `/rpc` client, and SSR data (public routes + root loader) goes through the read-only `content.*` group via the in-process caller (`@/server/http/ssr-caller`) — no route talks to domain services directly.

## Patterns

- All interactivity lives in React hooks/components under `@/client/` and `@/ui/`. No separate browser-script pipeline.
- Interactive components call resource URLs through the oRPC client. No server-module imports (type-only imports for `RouterClient<ApiRouter>` are allowed — `import type` erases at compile time).
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
- Avoid new client deps unless the interaction needs them.

## iOS auto-zoom

iOS Safari zooms in when focusing a control with `font-size < 16px`. `useIosNoZoomOnFocus()` in `@/client/hooks/use-ios-no-zoom` is mounted once at the top of `src/root.tsx`'s `App`. Document-level `focusin`/`focusout` covers every `INPUT`/`TEXTAREA`/`SELECT`. Do NOT re-install per-form — two listeners race the same `<meta>` rewrite. Gated to iOS/iPadOS WebKit; other platforms no-op.
