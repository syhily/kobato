import { evaluateSelfUpdateGate, type SelfUpdateGateEnvironment } from '@kobato/server/infra/sea/self-update-gate.ts'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let hostDir: string
let binaryDir: string
let dockerEnvPath: string
let cgroupPath: string

beforeEach(() => {
  hostDir = mkdtempSync(join(tmpdir(), 'kobato-self-update-gate-'))
  binaryDir = join(hostDir, 'bin')
  mkdirSync(binaryDir, { recursive: true })
  dockerEnvPath = join(hostDir, '.dockerenv')
  cgroupPath = join(hostDir, 'cgroup')
})

afterEach(() => {
  chmodSync(binaryDir, 0o755)
  rmSync(hostDir, { recursive: true, force: true })
})

function env(overrides: Partial<SelfUpdateGateEnvironment> = {}): SelfUpdateGateEnvironment {
  return {
    isSea: true,
    platform: 'linux',
    arch: 'x64',
    dockerEnvPath,
    cgroupPath,
    binaryDir,
    appVersion: '6.4.0',
    ...overrides,
  }
}

describe('update/gate evaluateSelfUpdateGate', () => {
  it('allows the happy path (SEA, linux x64, bare metal, writable, release build)', () => {
    const gate = evaluateSelfUpdateGate(env())
    expect(gate).toEqual({ canSelfUpdate: true, reasons: [], reasonDescriptors: [] })
  })

  it('allows linux arm64', () => {
    expect(evaluateSelfUpdateGate(env({ arch: 'arm64' })).canSelfUpdate).toBe(true)
  })

  it('refuses non-SEA deployments', () => {
    const gate = evaluateSelfUpdateGate(env({ isSea: false }))
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons).toHaveLength(1)
  })

  it('refuses non-linux platforms', () => {
    const gate = evaluateSelfUpdateGate(env({ platform: 'darwin', arch: 'arm64' }))
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.join()).toContain('Linux')
    expect(gate.reasonDescriptors.map((reason) => reason.messageKey)).toEqual(['update.gate.platform'])
    expect(gate.reasonDescriptors[0]!.fallbackMessage).toBe(
      'Self-update is only available for Linux (x64/arm64) binaries.',
    )
  })

  it('refuses unsupported linux arches', () => {
    expect(evaluateSelfUpdateGate(env({ arch: 'arm' })).canSelfUpdate).toBe(false)
  })

  it('refuses containerized deployments detected via the dockerenv marker', () => {
    writeFileSync(dockerEnvPath, '')
    const gate = evaluateSelfUpdateGate(env())
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons).toEqual(['Docker deployments must pull a new image to upgrade.'])
    expect(gate.reasonDescriptors[0]!.messageKey).toBe('update.gate.containerized')
  })

  it('refuses containerized deployments detected via the init cgroup', () => {
    writeFileSync(cgroupPath, '12:devices:/kubepods/burstable/pod123/abc')
    const gate = evaluateSelfUpdateGate(env())
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasonDescriptors.map((reason) => reason.messageKey)).toEqual(['update.gate.containerized'])
  })

  it('treats a bare-metal cgroup as not containerized', () => {
    writeFileSync(cgroupPath, '1:name=systemd:/init.scope\n0::/init.scope')
    expect(evaluateSelfUpdateGate(env()).canSelfUpdate).toBe(true)
  })

  it('treats an unreadable cgroup as not containerized', () => {
    expect(evaluateSelfUpdateGate(env({ cgroupPath: join(hostDir, 'missing-cgroup') })).canSelfUpdate).toBe(true)
  })

  it('refuses when the binary directory is not writable', () => {
    chmodSync(binaryDir, 0o555)
    const gate = evaluateSelfUpdateGate(env())
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.join()).toContain('not writable')
    expect(gate.reasonDescriptors[0]!.messageKey).toBe('update.gate.unwritable')
  })

  it('refuses dev builds', () => {
    const gate = evaluateSelfUpdateGate(env({ appVersion: '6.4.4-dev' }))
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.join()).toContain('Development builds')
    expect(gate.reasonDescriptors[0]!.messageKey).toBe('update.gate.devBuild')
  })

  it('accumulates every failed check as a reason', () => {
    const gate = evaluateSelfUpdateGate(
      env({ isSea: false, platform: 'darwin', arch: 'arm64', appVersion: '6.4.4-dev' }),
    )
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.length).toBeGreaterThanOrEqual(3)
    expect(gate.reasonDescriptors.map((reason) => reason.messageKey)).toEqual([
      'update.gate.notSea',
      'update.gate.platform',
      'update.gate.devBuild',
    ])
    for (const reason of gate.reasonDescriptors) {
      expect(reason.fallbackMessage).toMatch(/[A-Za-z]/)
    }
  })

  it('keeps the non-SEA reason in English while the descriptor carries the message id', () => {
    const gate = evaluateSelfUpdateGate(env({ isSea: false }))
    expect(gate.reasons).toEqual([
      'This deployment is not a single-file SEA binary; upgrade through the package manager or a container image.',
    ])
    expect(gate.reasonDescriptors[0]).toMatchObject({ messageKey: 'update.gate.notSea' })
  })
})
