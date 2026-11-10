// Fixed, detector-free OTel resource for every server signal (ADR-0012).
//
// Both DEV runtime entries (traces/metrics and logs) build their resource from
// this function, so the three keys exist exactly once and the shipped signals
// share one identity. No host/OS/process/env detector is involved.

import { APP_VERSION } from '@/shared/config/version'

const SERVICE_NAME = 'kobato'
const DEPLOYMENT_ENVIRONMENT = 'development'

export type TraceResourceAttributes = {
  'service.name': string
  'service.version': string
  'deployment.environment': string
}

/** A fresh object per call: OTel resource construction must not share mutable state. */
export function traceResourceAttributes(): TraceResourceAttributes {
  return {
    'service.name': SERVICE_NAME,
    'service.version': APP_VERSION,
    'deployment.environment': DEPLOYMENT_ENVIRONMENT,
  }
}
