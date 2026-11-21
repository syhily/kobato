import { TRACE_LOG_STREAM } from '@kobato/settings/telemetry/logs'
import {
  isTraceMetricStreamName,
  TRACE_METRIC_NAMES,
  TRACE_METRIC_STREAM_PREFIXES,
} from '@kobato/settings/telemetry/metrics'
import {
  RUM_PRIVACY_PIPELINE_DESCRIPTION,
  RUM_PRIVACY_PIPELINE_NAME,
  RUM_PRIVACY_VERSION_MARKER,
  RUM_PRIVACY_VRL_SHA256,
  RUM_STREAM_NAME,
} from '@kobato/settings/telemetry/pipeline'
import { RUM_INTAKE_PATH, RUM_RELAY_CLIENT_TOKEN, frontendRumBootstrapSchema } from '@kobato/settings/telemetry/rum'
import { describe, expect, it } from 'vitest'

describe('telemetry protocol vocabulary', () => {
  it('keeps the same-origin relay path and placeholder token stable', () => {
    expect(RUM_INTAKE_PATH).toBe('/api/rum/intake')
    expect(RUM_RELAY_CLIENT_TOKEN).toBe('kobato-relay')
  })

  it('accepts the browser bootstrap without endpoint or credential fields', () => {
    const parsed = frontendRumBootstrapSchema.parse({
      applicationId: 'kobato',
      service: 'kobato',
      environment: 'production',
      sessionSampleRate: 0,
      clientIdentity: 'anonymous',
    })
    expect(parsed).not.toHaveProperty('endpoint')
    expect(parsed).not.toHaveProperty('clientToken')
  })

  it('recognises every declared metric stream family', () => {
    for (const prefix of TRACE_METRIC_STREAM_PREFIXES) {
      expect(isTraceMetricStreamName(`${prefix}probe`), prefix).toBe(true)
    }
    expect(isTraceMetricStreamName('foreign_stream')).toBe(false)
    expect(TRACE_METRIC_NAMES.httpServerDuration).toBe('http.server.duration')
  })

  it('pins the shared OpenObserve stream and privacy-pipeline identity', () => {
    expect(RUM_STREAM_NAME).toBe('_rumdata')
    expect(TRACE_LOG_STREAM).toBe('kobato_logs')
    expect(RUM_PRIVACY_PIPELINE_NAME).toBe('kobato_rum_privacy')
    expect(RUM_PRIVACY_VERSION_MARKER).toMatch(/^allowlist-version=\d+$/)
    expect(RUM_PRIVACY_VRL_SHA256).toMatch(/^[a-f0-9]{64}$/)
    expect(RUM_PRIVACY_PIPELINE_DESCRIPTION).toContain(RUM_PRIVACY_VERSION_MARKER)
    expect(RUM_PRIVACY_PIPELINE_DESCRIPTION).toContain(`vrl-sha256=${RUM_PRIVACY_VRL_SHA256}`)
  })
})
