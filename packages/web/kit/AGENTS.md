# Web-kit conventions

`@kobato/web-kit` (`packages/web/kit/`) is the kit of ADR-0009/ADR-0011: the front-end features BOTH consuming surfaces
render that call a procedure — the notifications drawer family (`ui/shared/notifications`) and the logout
(`ui/shared/auth/use-logout.ts`) — plus `ui/lib/toast-api-error.ts` (sonner + message ids over API errors). It exists
because kobato never imports the public frontend: a module both surfaces render that calls the wire lives HERE, not in
either consumer. Two rules bound it from either side: `@kobato/ui` imports no `@kobato/api` module — a front-end module
that calls a procedure is a kit module or an app's own (ADR-0011 §1) — and a procedure-calling hook that needs no UI
package, no message copy, and no route data is not a kit module but the contract's own
(`@kobato/api/browser/use-notifications`, ADR-0011 §3). The kit may import `@kobato/ui`, `@kobato/api`, and the shared
leaves it declares — never `@kobato/inkling`, `@kobato/catalog/seo`, `@kobato/server`, either app (the sayaka app's
`@sayaka/*`, the kobato app's `@/*`), either consuming surface's own tree (`apps/kobato/src/ui`, `apps/sayaka/src/ui`),
or Node-only APIs. Both consumers import it — the workspace admin tree (`apps/kobato/src/ui`) and the public tree
(`apps/sayaka/src/ui`) (`packages/web/AGENTS.md`).

What is no longer a kit module: the comment surface is `@kobato/inkling/comment/*` and the editor platform is Inkling's
public barrel API (ADR-0011 §2); the document-shell modules — the settings contexts (`blog-settings-context`), locale
sync (`LocaleSyncProvider` + `locale-sync`), the chunk-recovery family, `BrandLogo`, `Image` with its hooks, and the
document clock — are `@kobato/ui`'s (`packages/web/ui/AGENTS.md`), together with the document shell both roots mount;
the root-data label hook `useKobatoInklingLabels` is the workspace's (`apps/kobato/src/ui/AGENTS.md`); the notifications
data hooks (`useUnreadNotificationCount`, `useInvalidateNotifications`, `usePatchNotificationReadState` with the
read-state cache patch beside them) are `@kobato/api/browser/use-notifications`'s — the family below consumes them and
never owns them.

## Structure

- `shared/notifications/` — the drawer, its lazy mount and chunk warm-up (`LazyNotificationsDrawer`), the badge, the
  list and detail panes, the compose dialog, `notification-meta.ts`, and `use-now.ts`. Every procedure call goes through
  `orpcQuery.public.notifications.*` or the frozen `admin.notifications.*` set
  (`apps/sayaka/tests/arch/frozen-admin-set.test.ts`); the hooks the family shares are the contract's
  (`@kobato/api/browser/use-notifications`).
- `shared/auth/use-logout.ts` — the logout over `account.auth.logout`; the CSRF token comes from the document shell
  (`useDocumentCsrfToken`, `@kobato/ui/lib/use-document-csrf-token`), never from React Router.
- `lib/toast-api-error.ts` — `toastApiError` / `onMutationError`: sonner toast copy by message id over API errors.

## Styles

`src/styles/kit.css` is the kit's one partial (never compiled alone): it scans the package `../ui` tree and is composed
by BOTH surface entries (`apps/kobato/src/styles/admin.css` directly, sayaka's `apps/sayaka/src/ui/styles/public.css`
transitively). The exact `@source` sets are pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.
`inkling-demo` no longer composes it: nothing the demo renders is a kit module.

## Rules

- No kit module reads root route data: a shared hook takes document facts from `@kobato/ui/lib/document-facts-context`
  (pinned by `apps/kobato/tests/arch/web-direction.test.ts`). The hooks it reads from `@kobato/api/browser` are held to
  the same line from the other side — that assembly imports no UI package, so it can never reach a kit module
  (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- Production sources are browser-safe (no `node:*` value imports).
- Interface copy is a UI message id resolved through `useI18n()`; icons are named `lucide-react` imports; conditional
  classNames go through `cn()`; JS-driven animation only through the `@kobato/ui/components/lazy-motion` facade with
  constants from `@kobato/ui/lib/motion`.
- Never import `shiki` here — highlighted code arrives pre-rendered (SSR-only).
- Tests live in `packages/web/kit/tests/unit`, run by the `web-unit` project, which matches only this package
  (`packages/web/kit/tests/unit/**`; the kit has no snapshot suite). `notifications-drawer.test.tsx` and
  `notifications-drawer.read-state.test.tsx` mirror the drawer — the latter drives the read-state cache patch through it
  over a real `QueryClient`; the patch's own cases sit beside the hook in
  `packages/api/tests/unit/browser/use-notifications.test.ts`, and both files share the notification cache fixture
  `@kobato/api/tests/utils/notifications` (`packages/api/tests/AGENTS.md`). `tests/utils/render.tsx` is the
  workspace-canonical web render helper — ThemeProvider → settings contexts → `DocumentFactsProvider` → `I18nProvider`
  over the test facts — imported cross-package as `@kobato/web-kit/tests/utils/render` (`tools/test/AGENTS.md`).
