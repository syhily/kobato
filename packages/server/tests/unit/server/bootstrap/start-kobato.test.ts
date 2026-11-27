import type { ServerType } from '@hono/node-server'

import { root } from '@kobato/server/infra/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface ProvisionOptions {
  site: unknown
  writeSettings: (patch: unknown) => Promise<void>
}

const h = vi.hoisted(() => {
  const calls: string[] = []
  const db = { id: 'db' }
  const app = { id: 'app' }
  const bindServer = { id: 'bind' }
  const hostServer = { id: 'host' }
  const provisionOptions: ProvisionOptions[] = []
  const getInstallState = vi.fn()
  const getSetupToken = vi.fn()
  const getProcessPool = vi.fn()
  const updateBlogSettingsSection = vi.fn()
  return {
    calls,
    db,
    app,
    bindServer,
    hostServer,
    provisionOptions,
    getInstallState,
    getSetupToken,
    getProcessPool,
    updateBlogSettingsSection,
  }
})

vi.mock('@kobato/server/bootstrap/db-lifecycle', () => ({ getDb: () => h.db }))

vi.mock('@kobato/server/http/kobato-app', () => ({
  createKobatoApp: (assetsRoot: string) => {
    h.calls.push(`createKobatoApp:${assetsRoot}`)
    return h.app
  },
  listenKobato: (candidate: unknown) => {
    h.calls.push(`listenKobato:${candidate === h.app}`)
    return h.bindServer
  },
}))

vi.mock('@kobato/server/http/leaked-response', () => ({
  wrapFetchWithLeakedResponseHandler: (candidate: unknown) => {
    h.calls.push(`wrapFetch:${candidate === h.app}`)
  },
}))

vi.mock('@kobato/server/infra/lifecycle', () => ({
  setHttpServer: (server: unknown) => {
    h.calls.push(`setHttpServer:${serverId(server)}`)
  },
  setRestartApp: (candidate: unknown) => {
    h.calls.push(`setRestartApp:${candidate === h.app}`)
  },
  setServerPhase: (phase: string) => {
    h.calls.push(`setServerPhase:${phase}`)
  },
}))

vi.mock('@kobato/server/domains/settings/services/migrate-secrets', () => ({
  migrateSecretsEncryption: async (candidate: unknown) => {
    h.calls.push(`migrateSecretsEncryption:${candidate === h.db}`)
  },
}))

vi.mock('@kobato/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: async (candidate: unknown) => {
    h.calls.push(`refreshBlogSettings:${candidate === h.db}`)
  },
  hydrateBlogSettings: async (candidate: unknown) => {
    h.calls.push(`hydrateBlogSettings:${candidate === h.db}`)
  },
}))

vi.mock('@kobato/server/domains/observability/runtime-manager', () => ({
  syncObservabilityRuntime: async () => {
    h.calls.push('syncObservabilityRuntime')
  },
}))

vi.mock('@kobato/server/domains/observability/provision', () => ({
  upgradeObservabilityProvisioningAtBoot: async (options: ProvisionOptions) => {
    h.calls.push('upgradeObservabilityProvisioningAtBoot')
    h.provisionOptions.push(options)
    await options.writeSettings({ provisionedFingerprint: 'fp' })
  },
}))

vi.mock('@kobato/server/domains/observability/retention', () => ({
  syncObservabilityRetention: async () => {
    h.calls.push('syncObservabilityRetention')
  },
}))

vi.mock('@kobato/server/domains/settings/services/core', () => ({
  updateBlogSettingsSection: (...args: unknown[]) => {
    h.calls.push(`updateBlogSettingsSection:${args[0] === h.db}:${String(args[1])}`)
    return h.updateBlogSettingsSection(...args)
  },
}))

vi.mock('@kobato/server/infra/job-registry', () => ({
  startAllRegisteredJobs: () => {
    h.calls.push('startAllRegisteredJobs')
  },
}))

vi.mock('@kobato/server/domains/settings/install-gate', () => ({
  getInstallState: (...args: unknown[]) => {
    h.calls.push(`getInstallState:${args[0] === h.db}`)
    return h.getInstallState(...args)
  },
}))

vi.mock('@kobato/server/domains/auth/setup-token', () => ({
  getSetupToken: (...args: unknown[]) => {
    h.calls.push(`getSetupToken:${args[0] === h.db}`)
    return h.getSetupToken(...args)
  },
}))

vi.mock('@kobato/server/infra/image/process-pool', () => ({
  getProcessPool: (...args: unknown[]) => {
    h.calls.push('getProcessPool')
    return h.getProcessPool(...args)
  },
}))

vi.mock('@kobato/server/domains/analytics/geoip/scheduler', () => ({}))
vi.mock('@kobato/server/domains/audit/services/scheduler', () => ({}))
vi.mock('@kobato/server/domains/auth/token-purge-scheduler', () => ({}))
vi.mock('@kobato/server/domains/backup/scheduler', () => ({}))
vi.mock('@kobato/server/domains/content/scheduled-publish', () => ({}))
vi.mock('@kobato/server/domains/webmentions/inbox-scheduler', () => ({}))
vi.mock('@kobato/server/domains/webmentions/outbox-scheduler', () => ({}))
vi.mock('@kobato/server/domains/webmentions/reverify-scheduler', () => ({}))
vi.mock('@kobato/server/infra/cache/kv-maintenance', () => ({}))
vi.mock('@kobato/server/infra/db/maintenance', () => ({}))

const { startKobato } = await import('@kobato/server/bootstrap/start-kobato')
const { __installDevHostStateForTests, __resetDevHostStateForTests, readDevHostFlag, writeDevHostFlag } =
  await import('@kobato/server/infra/dev-host-state')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('@kobato/settings/tests/utils/blog-settings')

const ASSETS_ROOT = '/tmp/workspace-client'

const COLD_BOOT = [
  'createKobatoApp:/tmp/workspace-client',
  'wrapFetch:true',
  'listenKobato:true',
  'setHttpServer:bind',
  'onListening:bind',
  'setRestartApp:true',
  'migrateSecretsEncryption:true',
  'refreshBlogSettings:true',
  'hydrateBlogSettings:true',
  'syncObservabilityRuntime',
  'upgradeObservabilityProvisioningAtBoot',
  'updateBlogSettingsSection:true:observability',
  'syncObservabilityRetention',
  'startAllRegisteredJobs',
  'getInstallState:true',
  'getSetupToken:true',
  'setServerPhase:running',
]

function serverId(server: unknown): string {
  return (server as { id?: string } | null)?.id ?? 'null'
}

function recordingOnListening() {
  return (server: unknown) => {
    h.calls.push(`onListening:${serverId(server)}`)
  }
}

describe('bootstrap/start-kobato', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    h.calls.length = 0
    h.provisionOptions.length = 0
    h.getInstallState.mockReset()
    h.getInstallState.mockResolvedValue('noAdmin')
    h.getSetupToken.mockReset()
    h.getSetupToken.mockResolvedValue('token')
    h.getProcessPool.mockReset()
    h.getProcessPool.mockResolvedValue({ id: 'pool' })
    h.updateBlogSettingsSection.mockReset()
    h.updateBlogSettingsSection.mockResolvedValue(undefined)
    vi.stubEnv('PROD', false)
    warnSpy = vi.spyOn(root, 'warn').mockImplementation(() => undefined)
    infoSpy = vi.spyOn(root, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    __resetDevHostStateForTests()
    vi.unstubAllEnvs()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
  })

  it('runs the boot steps in order on a cold start that binds the listener', async () => {
    const app = await startKobato({
      assetsRoot: ASSETS_ROOT,
      listener: { mode: 'bind' },
      onListening: recordingOnListening(),
    })

    expect(app).toBe(h.app)
    expect(h.calls).toEqual(COLD_BOOT)
    expect(readDevHostFlag('bootStepsRan')).toBe(false)
  })

  it('hands the observability provisioning the hydrated slice and the settings write seam', async () => {
    await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })

    expect(h.provisionOptions).toHaveLength(1)
    expect(h.provisionOptions[0]!.site).toBe(TEST_BLOG_SETTINGS_BUNDLE.observability?.observability ?? null)
    const patch = { provisionedFingerprint: 'fp' }
    expect(h.updateBlogSettingsSection).toHaveBeenCalledWith(h.db, 'observability', { observability: patch }, null)
  })

  it('registers the host HTTP server instead of binding in host mode', async () => {
    await startKobato({
      assetsRoot: ASSETS_ROOT,
      listener: { mode: 'host', server: h.hostServer as unknown as ServerType },
      onListening: recordingOnListening(),
    })

    expect(h.calls.slice(0, 5)).toEqual([
      'createKobatoApp:/tmp/workspace-client',
      'wrapFetch:true',
      'setHttpServer:host',
      'onListening:host',
      'setRestartApp:true',
    ])
    expect(h.calls).not.toContain('listenKobato:true')
    expect(h.calls.at(-1)).toBe('setServerPhase:running')
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledWith('🚧 Dev server started')
  })

  it('boots without an HTTP server when the host has none yet', async () => {
    const onListening = vi.fn()

    await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'host', server: null }, onListening })

    expect(h.calls.slice(0, 3)).toEqual([
      'createKobatoApp:/tmp/workspace-client',
      'wrapFetch:true',
      'setRestartApp:true',
    ])
    expect(onListening).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(h.calls.at(-1)).toBe('setServerPhase:running')
  })

  it('skips the secrets migration, the settings refresh, and the job start once the boot flag is set', async () => {
    const state = __installDevHostStateForTests()
    writeDevHostFlag('bootStepsRan', true)

    await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })

    expect(h.calls).not.toContain('migrateSecretsEncryption:true')
    expect(h.calls).not.toContain('refreshBlogSettings:true')
    expect(h.calls).not.toContain('startAllRegisteredJobs')
    for (const step of ['hydrateBlogSettings:true', 'syncObservabilityRuntime', 'syncObservabilityRetention']) {
      expect(h.calls).toContain(step)
    }
    expect(h.calls.at(-1)).toBe('setServerPhase:running')
    expect(state.flags.get('bootStepsRan')).toBe(true)
  })

  it('skips the setup token when an admin exists', async () => {
    h.getInstallState.mockResolvedValue('installed')

    await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })

    expect(h.calls).toContain('getInstallState:true')
    expect(h.calls).not.toContain('getSetupToken:true')
  })

  it('warns and keeps booting when the setup token cannot be generated', async () => {
    h.getInstallState.mockRejectedValue(new Error('token table locked'))

    const app = await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })

    expect(app).toBe(h.app)
    expect(warnSpy).toHaveBeenCalledWith(
      { err: 'token table locked' },
      'Failed to generate setup token on startup; will retry on first visit to /admin/setup',
    )
    expect(h.calls.at(-1)).toBe('setServerPhase:running')
  })

  it('warms the process pool only in production, after the setup token and before the running phase', async () => {
    await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })
    expect(h.calls).not.toContain('getProcessPool')

    h.calls.length = 0
    vi.stubEnv('PROD', true)
    await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })

    expect(h.calls.indexOf('getProcessPool')).toBeGreaterThan(h.calls.indexOf('getSetupToken:true'))
    expect(h.calls.indexOf('getProcessPool')).toBeLessThan(h.calls.indexOf('setServerPhase:running'))
  })

  it('warns and keeps booting when the process pool cannot warm in production', async () => {
    vi.stubEnv('PROD', true)
    h.getProcessPool.mockRejectedValue(new Error('sharp missing'))

    const app = await startKobato({ assetsRoot: ASSETS_ROOT, listener: { mode: 'bind' } })

    expect(app).toBe(h.app)
    expect(warnSpy).toHaveBeenCalledWith(
      { err: 'sharp missing' },
      'Failed to warm sharp process pool on startup; will lazy-init on first upload',
    )
    expect(h.calls.at(-1)).toBe('setServerPhase:running')
  })
})
