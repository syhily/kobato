import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  accessSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  accessSync: fsMocks.accessSync,
  constants: { W_OK: 2 },
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}))

const seaMocks = vi.hoisted(() => ({ isSea: vi.fn() }))
vi.mock('@/server/infra/sea', () => ({ isSea: seaMocks.isSea }))

const versionState = vi.hoisted(() => ({ value: '6.4.0' }))
vi.mock('@/shared/config/version', () => ({
  get APP_VERSION() {
    return versionState.value
  },
}))

const { evaluateSelfUpdateGate } = await import('@/server/infra/self-update-gate')

const realPlatform = process.platform
const realArch = process.arch

function setHost(platform: string, arch: string) {
  Object.defineProperty(process, 'platform', { value: platform })
  Object.defineProperty(process, 'arch', { value: arch })
}

describe('update/gate evaluateSelfUpdateGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seaMocks.isSea.mockReturnValue(true)
    setHost('linux', 'x64')
    fsMocks.existsSync.mockReturnValue(false)
    fsMocks.readFileSync.mockReturnValue('1:name=systemd:/init.scope\n0::/init.scope')
    fsMocks.accessSync.mockReturnValue(undefined)
    versionState.value = '6.4.0'
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
    Object.defineProperty(process, 'arch', { value: realArch })
  })

  it('allows the happy path (SEA, linux x64, bare metal, writable, release build)', () => {
    const gate = evaluateSelfUpdateGate()
    expect(gate).toEqual({ canSelfUpdate: true, reasons: [], reasonDescriptors: [] })
  })

  it('allows linux arm64', () => {
    setHost('linux', 'arm64')
    expect(evaluateSelfUpdateGate().canSelfUpdate).toBe(true)
  })

  it('refuses non-SEA deployments', () => {
    seaMocks.isSea.mockReturnValue(false)
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons).toHaveLength(1)
  })

  it('refuses non-linux platforms', () => {
    setHost('darwin', 'arm64')
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.join()).toContain('Linux')
    expect(gate.reasonDescriptors.map((reason) => reason.messageKey)).toEqual(['update.gate.platform'])
    expect(gate.reasonDescriptors[0]!.fallbackMessage).toBe(
      'Self-update is only available for Linux (x64/arm64) binaries.',
    )
  })

  it('refuses unsupported linux arches', () => {
    setHost('linux', 'arm')
    expect(evaluateSelfUpdateGate().canSelfUpdate).toBe(false)
  })

  it('refuses containerized deployments detected via /.dockerenv', () => {
    fsMocks.existsSync.mockImplementation((path: string) => path === '/.dockerenv')
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons).toEqual(['Docker deployments must pull a new image to upgrade.'])
    expect(gate.reasonDescriptors[0]!.messageKey).toBe('update.gate.containerized')
  })

  it('refuses containerized deployments detected via /proc/1/cgroup', () => {
    fsMocks.readFileSync.mockReturnValue('12:devices:/kubepods/burstable/pod123/abc')
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasonDescriptors.map((reason) => reason.messageKey)).toEqual(['update.gate.containerized'])
  })

  it('treats an unreadable cgroup as not containerized', () => {
    fsMocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(evaluateSelfUpdateGate().canSelfUpdate).toBe(true)
  })

  it('refuses when the binary directory is not writable', () => {
    fsMocks.accessSync.mockImplementation(() => {
      throw new Error('EACCES')
    })
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.join()).toContain('not writable')
    expect(gate.reasonDescriptors[0]!.messageKey).toBe('update.gate.unwritable')
  })

  it('refuses dev builds', () => {
    versionState.value = '6.4.4-dev'
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.join()).toContain('Development builds')
    expect(gate.reasonDescriptors[0]!.messageKey).toBe('update.gate.devBuild')
  })

  it('accumulates every failed check as a reason', () => {
    seaMocks.isSea.mockReturnValue(false)
    setHost('darwin', 'arm64')
    versionState.value = '6.4.4-dev'
    const gate = evaluateSelfUpdateGate()
    expect(gate.canSelfUpdate).toBe(false)
    expect(gate.reasons.length).toBeGreaterThanOrEqual(3)
    expect(gate.reasonDescriptors.map((reason) => reason.messageKey)).toEqual([
      'update.gate.notSea',
      'update.gate.platform',
      'update.gate.devBuild',
    ])
    // Every descriptor keeps an English technical fallback for doctor/logs.
    for (const reason of gate.reasonDescriptors) {
      expect(reason.fallbackMessage).toMatch(/[A-Za-z]/)
    }
  })

  it('keeps the non-SEA reason in English while the descriptor carries the message id', () => {
    seaMocks.isSea.mockReturnValue(false)
    const gate = evaluateSelfUpdateGate()
    expect(gate.reasons).toEqual([
      'This deployment is not a single-file SEA binary; upgrade through the package manager or a container image.',
    ])
    expect(gate.reasonDescriptors[0]).toMatchObject({ messageKey: 'update.gate.notSea' })
  })
})
