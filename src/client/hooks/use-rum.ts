// Root-mounted browser RUM activation (ADR-0012).
//
// The hook renders nothing, runs only in effects after hydration, and checks
// DNT/GPC BEFORE any dynamic import. The slim SDK chunk is therefore never
// downloaded by a denied browser — and never at all by a visitor whose site has
// no verified `observability` frontend configuration (the root loader then
// omits the bootstrap). Initialization is idempotent under React StrictMode and
// HMR, and a rejected import/bootstrap never escapes.

import { useEffect } from 'react'
import { useMatches } from 'react-router'

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { rumRouteContextFromMatches } from '@/client/lib/rum-route'
import { frontendRumBootstrapSchema } from '@/shared/contracts/trace'

type RumModule = typeof import('@/client/lib/openobserve-rum')

let rumModulePromise: Promise<RumModule> | null = null
let pendingStopTimer: ReturnType<typeof setTimeout> | null = null

function loadRumModule(): Promise<RumModule> {
  rumModulePromise ??= import('@/client/lib/openobserve-rum')
  return rumModulePromise
}

function cancelPendingStop(): void {
  if (pendingStopTimer !== null) {
    clearTimeout(pendingStopTimer)
    pendingStopTimer = null
  }
}

/**
 * Cleanup runs on a route change, StrictMode's double effect, and a real
 * unmount. Defer the full stop one task so the next effect can cancel it:
 * a valid route change restarts polling; bootstrap=null cancels this and
 * suspends (keeping the SDK/route/poll alive); DNT/GPC/invalid bootstrap
 * cancel this and fully stop; with no following effect (real unmount) the
 * deferred stop runs.
 */
function schedulePendingStop(): void {
  cancelPendingStop()
  pendingStopTimer = setTimeout(() => {
    pendingStopTimer = null
    if (rumModulePromise === null) {
      return
    }
    void rumModulePromise
      .then((module) => module.stopRum())
      .catch(() => {
        // The module was requested but failed to load; there is nothing to stop.
      })
  }, 0)
}

function applyModuleAction(action: 'suspend' | 'stop'): void {
  if (rumModulePromise === null) {
    return
  }
  cancelPendingStop()
  void rumModulePromise
    .then((module) => (action === 'suspend' ? module.suspendRum() : module.stopRum()))
    .catch(() => {
      // The module was requested but failed to load; there is nothing to stop.
    })
}

/** Test seam: forget the cached dynamic-import promise and any pending revoke. */
export function __resetRumHookForTests(): void {
  cancelPendingStop()
  rumModulePromise = null
}

/** Test seam: `true` once the SDK chunk import has been requested. */
export function __isRumModuleRequestedForTests(): boolean {
  return rumModulePromise !== null
}

/**
 * DNT=`1` and GPC=`true` both suppress the SDK download. The checks are
 * browser-only and read defensively: a missing Navigator/policy is allowed.
 */
export function isRumDenied(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (nav === undefined) {
    return false
  }
  if (nav.doNotTrack === '1') {
    return true
  }
  return Reflect.get(nav, 'globalPrivacyControl') === true
}

/**
 * Mount once at the root. `bootstrap` is the narrow root-loader projection; it
 * is absent when observability is disabled, when frontend RUM is incomplete,
 * and when the O2 pipeline verification withheld the gate. An initial `null` is
 * a no-op (no import, no DOM). After an active bootstrap, `null` means the gate
 * was withheld: suspend consent but keep the SDK handle, route, and status poll
 * alive so a later gate recovery can `startView` in the same document. DNT/GPC,
 * invalid bootstrap, and real unmount fully stop instead.
 */
export function useRum(bootstrap: FrontendRumBootstrap | null): void {
  const route = rumRouteContextFromMatches(useMatches())
  const routeId = route.id
  const routeTemplate = route.template
  const denied = isRumDenied()

  useEffect(() => {
    // Build-time constant: the SSR bundle must never pull the browser RUM
    // chunk. Folding this to `true` removes the dynamic import edge, so the
    // server graph (and the SEA binary) carries no `@openobserve` code.
    if (import.meta.env.SSR) {
      return
    }
    if (denied) {
      // DNT/GPC is a terminal user decision: stop the SDK and its poll. An
      // initial denial has no module request and therefore no import.
      applyModuleAction('stop')
      return
    }
    if (bootstrap === null) {
      // The O2 gate can temporarily withhold the bootstrap. Keep the retained
      // SDK handle, route, and status poll so a later gate recovery can
      // `startView` in this document. An initial disabled load never imports.
      applyModuleAction('suspend')
      // A real unmount while suspended must still fully stop; a following
      // active effect (bootstrap returns) cancels this deferred stop.
      return () => schedulePendingStop()
    }
    const parsed = frontendRumBootstrapSchema.safeParse(bootstrap)
    if (!parsed.success) {
      applyModuleAction('stop')
      return
    }

    // This effect is valid: cancel a revoke scheduled by a route-change or
    // StrictMode cleanup. The SDK stays initialized and only its view/poller
    // is refreshed by `startRum`.
    cancelPendingStop()

    let cancelled = false
    void loadRumModule()
      .then((module) => {
        if (!cancelled) {
          return module.startRum(parsed.data, { id: routeId, template: routeTemplate })
        }
        return undefined
      })
      .catch(() => {
        // Best effort: the site never reacts to telemetry failures.
      })

    return () => {
      cancelled = true
      // The old poller must not stack across route changes. A following
      // bootstrap=null effect cancels this and suspends; DNT/invalid effects
      // cancel and fully stop; a real unmount leaves no following effect, so
      // this deferred full stop runs.
      schedulePendingStop()
    }
  }, [bootstrap, denied, routeId, routeTemplate])
}
