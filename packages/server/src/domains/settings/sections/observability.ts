import {
  isSecureObservabilityOrigin,
  normalizeObservabilityOrigin,
  OBSERVABILITY_ORGANIZATION_PATTERN,
} from '@kobato/server/infra/observability'
import {
  observabilityValidationMessages,
  observabilityWriteSchema as baseObservabilityWriteSchema,
} from '@kobato/settings/sections/observability'

export const observabilityWriteSchema = baseObservabilityWriteSchema.superRefine((value, ctx) => {
  const site = value.observability
  if (site.endpoint !== '' && !isSecureObservabilityOrigin(site.endpoint)) {
    ctx.addIssue({
      code: 'custom',
      path: ['observability', 'endpoint'],
      message:
        normalizeObservabilityOrigin(site.endpoint) === null
          ? observabilityValidationMessages.endpointInvalid
          : observabilityValidationMessages.endpointHttps,
    })
  }
  if (site.organization !== '' && !OBSERVABILITY_ORGANIZATION_PATTERN.test(site.organization)) {
    ctx.addIssue({
      code: 'custom',
      path: ['observability', 'organization'],
      message: observabilityValidationMessages.organizationInvalid,
    })
  }
})
