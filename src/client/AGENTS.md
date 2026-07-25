# Client conventions

`src/client/` is browser-only. May import from `shared/` and other
`client/`. Must not import any `server/` module or Node-only API.

## Structure

- `hooks/` — browser hooks. Admin file uploads go through
  `useFileUpload` (`@/client/hooks/use-file-upload`): it owns the CSRF
  read, accept/size guards, FormData POST, error unwrap, and toast
  choreography. Never hand-roll a fetch upload in a view.
- `api/` — oRPC client. All HTTP calls go through
  `api.<domain>.<endpoint>(flatInput)` from `@/client/api/client`. The
  typed client is built from `typeof apiRouter`. `unwrap()` translates
  oRPC `ORPCError` rejections into `ApiError`. TanStack Query wrappers
  in `@/client/api/orpc-query`.

## Patterns

- All interactivity lives in components/hooks under `@/client/` and
  `@/ui/` as React islands. No separate browser-script pipeline
  (`src/assets/scripts` is intentionally absent).
- Interactive components call resource URLs through the oRPC client.
  No server-module imports (a type-only import for
  `RouterClient<ApiRouter>` is the one allowed exception — `import
type` erases at compile time).
- Heavy widgets (e.g. `qrcode.react`) reach the bundle via React.lazy +
  Suspense from a UI component, not top-level imports
  (`bundle-dynamic-imports`).
- Avoid new client deps unless the interaction needs them.

## iOS auto-zoom contract

iOS Safari zooms in when focusing a control with `font-size < 16px`.
Instead of a typographic floor (would break density), every form
control inherits an app-wide hook that disables user-scaling on the
viewport `<meta>` while any control is focused.

- Single source: `useIosNoZoomOnFocus()` in
  `@/client/hooks/use-ios-no-zoom`, mounted **once** at the top of
  `src/root.tsx`'s `App`. Document-level `focusin`/`focusout` covers
  every `INPUT`/`TEXTAREA`/`SELECT`. Do NOT re-install per-form — two
  listeners race the same `<meta>` rewrite. Gated to iOS/iPadOS WebKit;
  other platforms no-op. Focus traversal keeps the lock; the meta value
  restores only when focus leaves form-control DOM entirely.
