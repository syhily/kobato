# Client conventions

`packages/client/src/` is browser-only. May import from `@kobato/shared` and other `@kobato/client` modules. Must not import any `@kobato/server` module or Node-only API (type-only `ApiRouter` imports excepted — `import type` erases at compile time).

## Structure

- `hooks/` — browser hooks. Admin file uploads go through `useFileUpload` (`@kobato/client/hooks/use-file-upload`): it owns the CSRF read, accept/size guards, FormData POST, error unwrap, and toast choreography. Never hand-roll a fetch upload in a view.
- `api/` — oRPC client. All RPC calls go through `orpc.<domain>.<endpoint>(flatInput)` from `@kobato/client/api/client`; server errors arrive as `ORPCError` rejections. TanStack Query wrappers live in `@kobato/client/api/orpc-query`.

## Patterns

- All interactivity lives in React hooks/components under `@kobato/client/` and `@kobato/ui/`. No separate browser-script pipeline.
- Interactive components call resource URLs through the oRPC client. No server-module imports (type-only imports for `RouterClient<ApiRouter>` are allowed — `import type` erases at compile time).
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
- Avoid new client deps unless the interaction needs them.

## iOS auto-zoom

iOS Safari zooms in when focusing a control with `font-size < 16px`. `useIosNoZoomOnFocus()` in `@kobato/client/hooks/use-ios-no-zoom` is mounted once at the top of `apps/core/src/root.tsx`'s `App`. Document-level `focusin`/`focusout` covers every `INPUT`/`TEXTAREA`/`SELECT`. Do NOT re-install per-form — two listeners race the same `<meta>` rewrite. Gated to iOS/iPadOS WebKit; other platforms no-op.
