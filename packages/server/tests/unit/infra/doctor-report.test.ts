import type { DoctorProbes } from '@kobato/server/infra/doctor-report'

import { collectDoctorReport, doctorOk, formatDoctorText, parseProbeIssues } from '@kobato/server/infra/doctor-report'
import { describe, expect, it } from 'vitest'

function probes(overrides: Partial<DoctorProbes> = {}): DoctorProbes {
  return {
    version: '6.2.0',
    sea: true,
    checkNatives: () => Promise.resolve(),
    evaluateGate: () => ({ canSelfUpdate: true, reasons: [] }),
    probeConfig: () => Promise.resolve({ ok: true, issues: [] }),
    ...overrides,
  }
}

describe('infra/doctor-report', () => {
  it('collects a fully healthy report', async () => {
    const report = await collectDoctorReport(probes())

    expect(report).toMatchObject({
      version: '6.2.0',
      sea: true,
      natives: { ok: true },
      selfUpdate: { canSelfUpdate: true, reasons: [] },
      config: { ok: true, issues: [] },
    })
    expect(doctorOk(report)).toBe(true)
  })

  it('captures a natives failure as data, never as a throw', async () => {
    const report = await collectDoctorReport(
      probes({ checkNatives: () => Promise.reject(new Error('sharp re-encode produced an empty buffer')) }),
    )

    expect(report.natives).toEqual({ ok: false, error: 'sharp re-encode produced an empty buffer' })
    expect(doctorOk(report)).toBe(false)
  })

  it('treats self-update gate reasons as advisory, not failure', async () => {
    const report = await collectDoctorReport(
      probes({ evaluateGate: () => ({ canSelfUpdate: false, reasons: ['Docker 部署请拉取新镜像升级'] }) }),
    )

    expect(report.selfUpdate.reasons).toEqual(['Docker 部署请拉取新镜像升级'])
    expect(doctorOk(report)).toBe(true)
  })

  it('fails the report on config issues', async () => {
    const report = await collectDoctorReport(
      probes({ probeConfig: () => Promise.resolve({ ok: false, issues: ['security.sessionSecret: 太短'] }) }),
    )

    expect(doctorOk(report)).toBe(false)
    const text = formatDoctorText(report)
    expect(text).toContain('config:      FAILED')
    expect(text).toContain('    - security.sessionSecret: 太短')
  })

  it('formats gate reasons and the SEA marker into the text report', async () => {
    const text = formatDoctorText(
      await collectDoctorReport(
        probes({ evaluateGate: () => ({ canSelfUpdate: false, reasons: ['当前为开发版本，不支持自更新'] }) }),
      ),
    )

    expect(text).toContain('(SEA)')
    expect(text).toContain('natives:     ok')
    expect(text).toContain('self-update: unavailable')
    expect(text).toContain('    - 当前为开发版本，不支持自更新')
  })

  it('parses probe stderr issue lines and falls back to the whole output', () => {
    expect(parseProbeIssues('Environment validation failed:\n  - a: x\n  - b: y\n\nhint')).toEqual(['a: x', 'b: y'])
    expect(parseProbeIssues('spawn exploded')).toEqual(['spawn exploded'])
    expect(parseProbeIssues('  \n')).toEqual(['config probe failed without diagnostics'])
  })
})
