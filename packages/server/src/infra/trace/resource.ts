import { APP_VERSION } from '@kobato/distribution/app.ts'

const SERVICE_NAME = 'kobato'
const DEPLOYMENT_ENVIRONMENT = 'development'

export type TraceResourceAttributes = {
  'service.name': string
  'service.version': string
  'deployment.environment': string
}

export function traceResourceAttributes(): TraceResourceAttributes {
  return {
    'service.name': SERVICE_NAME,
    'service.version': APP_VERSION,
    'deployment.environment': DEPLOYMENT_ENVIRONMENT,
  }
}
