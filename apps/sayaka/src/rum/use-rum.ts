import type { FrontendRumBootstrap } from '@kobato/settings/telemetry/rum'
import type { RumConsent } from '@sayaka/rum/rum-consent'

import { frontendRumBootstrapSchema } from '@kobato/settings/telemetry/rum'
import { rumRouteContextFromMatches } from '@sayaka/rum/rum-route'
import { useEffect } from 'react'
import { useMatches } from 'react-router'

type RumModule = typeof import('@sayaka/rum/openobserve-rum')

let rumModulePromise: Promise<RumModule> | null = null
let pendingStopTimer: ReturnType<typeof setTimeout> | null = null

function loadRumModule(): Promise<RumModule> {
  rumModulePromise ??= import('@sayaka/rum/openobserve-rum')
  return rumModulePromise
}

function cancelPendingStop(): void {
  if (pendingStopTimer !== null) {
    clearTimeout(pendingStopTimer)
    pendingStopTimer = null
  }
}

function schedulePendingStop(): void {
  cancelPendingStop()
  pendingStopTimer = setTimeout(() => {
    pendingStopTimer = null
    if (rumModulePromise === null) {
      return
    }
    void rumModulePromise.then((module) => module.stopRum()).catch(() => undefined)
  }, 0)
}

function applyModuleAction(action: 'suspend' | 'stop'): void {
  if (rumModulePromise === null) {
    return
  }
  cancelPendingStop()
  void rumModulePromise
    .then((module) => (action === 'suspend' ? module.suspendRum() : module.stopRum()))
    .catch(() => undefined)
}

export function __resetRumHookForTests(): void {
  cancelPendingStop()
  rumModulePromise = null
}

export function __isRumModuleRequestedForTests(): boolean {
  return rumModulePromise !== null
}

export function isRumDenied(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (nav === undefined) {
    return false
  }
  if (nav.doNotTrack === '1') {
    return true
  }
  return Reflect.get(nav, 'globalPrivacyControl') === true
}

export function useRum(bootstrap: FrontendRumBootstrap | null, consent: RumConsent | null = null): void {
  const route = rumRouteContextFromMatches(useMatches())
  const routeId = route.id
  const routeTemplate = route.template
  const denied = isRumDenied()

  useEffect(() => {
    if (import.meta.env.SSR) {
      return
    }
    if (denied) {
      applyModuleAction('stop')
      return
    }
    if (bootstrap === null) {
      applyModuleAction('suspend')
      return () => schedulePendingStop()
    }
    const parsed = frontendRumBootstrapSchema.safeParse(bootstrap)
    if (!parsed.success) {
      applyModuleAction('stop')
      return
    }
    if (parsed.data.clientIdentity === 'forward' && consent !== 'accepted') {
      applyModuleAction('stop')
      return
    }

    cancelPendingStop()

    let cancelled = false
    void loadRumModule()
      .then((module) => {
        if (!cancelled) {
          return module.startRum(parsed.data, { id: routeId, template: routeTemplate })
        }
        return undefined
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      schedulePendingStop()
    }
  }, [bootstrap, consent, denied, routeId, routeTemplate])
}
