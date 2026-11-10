import type { DeviceEnvBeacon } from '@/shared/contracts/analytics'

// Every browser API is read defensively: a missing / non-finite value is
// OMITTED from the payload (the wire contract makes every dimension optional),
// never sent as null — `null` is not a valid beacon value.

/** Session-static block: collected once per browser session. */
export type DeviceEnvStaticFields = Pick<
  DeviceEnvBeacon,
  | 'screenW'
  | 'screenH'
  | 'availW'
  | 'availH'
  | 'colorDepth'
  | 'touchPoints'
  | 'pointer'
  | 'hover'
  | 'locale'
  | 'timezone'
  | 'hardwareConcurrency'
  | 'deviceMemory'
>

/** Per-page block: collected on every beacon. */
export type DeviceEnvDynamicFields = Pick<
  DeviceEnvBeacon,
  | 'viewportW'
  | 'viewportH'
  | 'dpr'
  | 'colorScheme'
  | 'reducedMotion'
  | 'netEffectiveType'
  | 'netDownlink'
  | 'netRtt'
  | 'netSaveData'
>

interface NavigatorWithExtras extends Navigator {
  /** Chrome-only (`navigator.deviceMemory`, GiB). */
  deviceMemory?: number
  /** Network Information API — Chromium only; absent in Firefox/Safari. */
  connection?: {
    effectiveType?: string
    downlink?: number
    rtt?: number
    saveData?: boolean
  }
}

const isEffectiveType = (value: unknown): value is NonNullable<DeviceEnvDynamicFields['netEffectiveType']> =>
  value === 'slow-2g' || value === '2g' || value === '3g' || value === '4g'

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** `matchMedia` result, or undefined where the API does not exist. */
function mediaMatches(query: string): boolean | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return undefined
  }
  try {
    return window.matchMedia(query).matches
  } catch {
    return undefined
  }
}

function hasBrowserGlobals(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined'
}

/** Screen / touch / locale / hardware — sent once per browser session. */
export function collectStaticEnv(): DeviceEnvStaticFields {
  if (!hasBrowserGlobals()) {
    return {}
  }
  const nav = navigator as NavigatorWithExtras
  const screen = window.screen

  const pointer =
    mediaMatches('(pointer: coarse)') === true
      ? 'coarse'
      : mediaMatches('(pointer: fine)') === true
        ? 'fine'
        : undefined
  const hover =
    mediaMatches('(hover: hover)') === true ? 'hover' : mediaMatches('(hover: none)') === true ? 'none' : undefined

  let timezone: string | undefined
  try {
    timezone = nonEmptyString(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    timezone = undefined
  }

  const screenW = finiteOrUndefined(screen?.width)
  const screenH = finiteOrUndefined(screen?.height)
  const availW = finiteOrUndefined(screen?.availWidth)
  const availH = finiteOrUndefined(screen?.availHeight)
  const colorDepth = finiteOrUndefined(screen?.colorDepth)
  const touchPoints = finiteOrUndefined(nav.maxTouchPoints)
  const locale = nonEmptyString(nav.language)
  const hardwareConcurrency = finiteOrUndefined(nav.hardwareConcurrency)
  const deviceMemory = finiteOrUndefined(nav.deviceMemory)

  return {
    ...(screenW === undefined ? {} : { screenW }),
    ...(screenH === undefined ? {} : { screenH }),
    ...(availW === undefined ? {} : { availW }),
    ...(availH === undefined ? {} : { availH }),
    ...(colorDepth === undefined ? {} : { colorDepth }),
    ...(touchPoints === undefined ? {} : { touchPoints }),
    ...(pointer === undefined ? {} : { pointer }),
    ...(hover === undefined ? {} : { hover }),
    ...(locale === undefined ? {} : { locale }),
    ...(timezone === undefined ? {} : { timezone }),
    ...(hardwareConcurrency === undefined ? {} : { hardwareConcurrency }),
    ...(deviceMemory === undefined ? {} : { deviceMemory }),
  }
}

/** Viewport / DPR / preferences / network — sent on every beacon. */
export function collectDynamicEnv(): DeviceEnvDynamicFields {
  if (!hasBrowserGlobals()) {
    return {}
  }
  const nav = navigator as NavigatorWithExtras
  const connection = nav.connection

  const viewportW = finiteOrUndefined(window.innerWidth)
  const viewportH = finiteOrUndefined(window.innerHeight)
  const dpr = finiteOrUndefined(window.devicePixelRatio)
  const colorScheme =
    mediaMatches('(prefers-color-scheme: dark)') === true
      ? 'dark'
      : mediaMatches('(prefers-color-scheme: light)') === true
        ? 'light'
        : undefined
  const reducedMotion = mediaMatches('(prefers-reduced-motion: reduce)')
  const effectiveType = connection?.effectiveType
  const netEffectiveType = isEffectiveType(effectiveType) ? effectiveType : undefined
  const netDownlink = finiteOrUndefined(connection?.downlink)
  const netRtt = finiteOrUndefined(connection?.rtt)
  const netSaveData = typeof connection?.saveData === 'boolean' ? connection.saveData : undefined

  return {
    ...(viewportW === undefined ? {} : { viewportW }),
    ...(viewportH === undefined ? {} : { viewportH }),
    ...(dpr === undefined ? {} : { dpr }),
    ...(colorScheme === undefined ? {} : { colorScheme }),
    ...(reducedMotion === undefined ? {} : { reducedMotion }),
    ...(netEffectiveType === undefined ? {} : { netEffectiveType }),
    ...(netDownlink === undefined ? {} : { netDownlink }),
    ...(netRtt === undefined ? {} : { netRtt }),
    ...(netSaveData === undefined ? {} : { netSaveData }),
  }
}

/** Compose one beacon payload; the static block rides only the first send of a session. */
export function buildDeviceEnvBeacon(eventId: string, includeStatic: boolean): DeviceEnvBeacon {
  return {
    eventId,
    hasStatic: includeStatic,
    ...collectDynamicEnv(),
    ...(includeStatic ? collectStaticEnv() : {}),
  }
}
