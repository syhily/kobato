// `kobato doctor` report assembly — pure functions over injected probes,
// so the whole diagnostic shape is unit-testable without a SEA binary.

export interface DoctorReport {
  version: string
  platform: string
  sea: boolean
  natives: { ok: boolean; error?: string }
  selfUpdate: { canSelfUpdate: boolean; reasons: string[] }
  config: { ok: boolean; issues: string[] }
}

export interface DoctorProbes {
  version: string
  sea: boolean
  /** Resolves when the native libraries load and round-trip; throws otherwise. */
  checkNatives: () => Promise<void>
  evaluateGate: () => { canSelfUpdate: boolean; reasons: string[] }
  probeConfig: () => Promise<{ ok: boolean; issues: string[] }>
}

export async function collectDoctorReport(probes: DoctorProbes): Promise<DoctorReport> {
  let natives: DoctorReport['natives']
  try {
    await probes.checkNatives()
    natives = { ok: true }
  } catch (error) {
    natives = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  return {
    version: probes.version,
    platform: `${process.platform}-${process.arch}`,
    sea: probes.sea,
    natives,
    selfUpdate: probes.evaluateGate(),
    config: await probes.probeConfig(),
  }
}

export function doctorOk(report: DoctorReport): boolean {
  // Self-update gate is advisory — healthy deployments may legitimately lack it.
  return report.natives.ok && report.config.ok
}

/** Probe issues ride stderr as `  - key: message` lines; anything else is preserved whole. */
export function parseProbeIssues(stderr: string): string[] {
  const issues = stderr
    .split('\n')
    .filter((line) => line.startsWith('  - '))
    .map((line) => line.slice(4))
  if (issues.length > 0) {
    return issues
  }
  const trimmed = stderr.trim()
  return trimmed === '' ? ['config probe failed without diagnostics'] : [trimmed]
}

export function formatDoctorText(report: DoctorReport): string {
  const lines = [
    `kobato doctor`,
    `  version:     ${report.version}`,
    `  platform:    ${report.platform}${report.sea ? ' (SEA)' : ' (not a SEA binary)'}`,
    `  natives:     ${report.natives.ok ? 'ok' : `FAILED — ${report.natives.error ?? 'unknown error'}`}`,
    `  config:      ${report.config.ok ? 'ok' : 'FAILED'}`,
  ]
  for (const issue of report.config.issues) {
    lines.push(`    - ${issue}`)
  }
  if (report.selfUpdate.canSelfUpdate) {
    lines.push(`  self-update: ready`)
  } else {
    lines.push(`  self-update: unavailable`)
    for (const reason of report.selfUpdate.reasons) {
      lines.push(`    - ${reason}`)
    }
  }
  return `${lines.join('\n')}\n`
}
