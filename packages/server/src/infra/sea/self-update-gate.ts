import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { APP_VERSION } from '@kobato/distribution/app'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { isSea } from '@kobato/server/infra/sea/sea'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const SELF_UPDATE_GATE_REASON_KEYS = [
  'update.gate.notSea',
  'update.gate.platform',
  'update.gate.containerized',
  'update.gate.unwritable',
  'update.gate.devBuild',
] as const satisfies readonly UiMessageId[]

export type SelfUpdateGateReasonKey = (typeof SELF_UPDATE_GATE_REASON_KEYS)[number]

export interface SelfUpdateGateResult {
  canSelfUpdate: boolean
  /** English technical text — `kobato doctor`, logs and diagnostics. */
  reasons: string[]
  /** Typed admin-facing descriptors, resolved by the VersionDialog per locale. */
  reasonDescriptors: ErrorMessageDescriptor[]
}

const SUPPORTED_ARCHES = new Set(['x64', 'arm64'])
const CONTAINER_CGROUP_PATTERN = /docker|kubepods|containerd|podman/

export interface SelfUpdateGateEnvironment {
  isSea: boolean
  platform: NodeJS.Platform
  arch: string
  dockerEnvPath: string
  cgroupPath: string
  binaryDir: string
  appVersion: string
}

function defaultEnvironment(): SelfUpdateGateEnvironment {
  return {
    isSea: isSea(),
    platform: process.platform,
    arch: process.arch,
    dockerEnvPath: '/.dockerenv',
    cgroupPath: '/proc/1/cgroup',
    binaryDir: dirname(process.execPath),
    appVersion: APP_VERSION,
  }
}

function isContainerized(env: SelfUpdateGateEnvironment): boolean {
  if (existsSync(env.dockerEnvPath)) {
    return true
  }
  try {
    return CONTAINER_CGROUP_PATTERN.test(readFileSync(env.cgroupPath, 'utf8'))
  } catch {
    return false
  }
}

export function evaluateSelfUpdateGate(environment: Partial<SelfUpdateGateEnvironment> = {}): SelfUpdateGateResult {
  const env: SelfUpdateGateEnvironment = { ...defaultEnvironment(), ...environment }
  const reasonDescriptors: ErrorMessageDescriptor[] = []
  const add = (messageKey: SelfUpdateGateReasonKey): void => {
    reasonDescriptors.push({ messageKey, fallbackMessage: uiMessagesEnUS[messageKey] })
  }

  if (!env.isSea) {
    add('update.gate.notSea')
  }
  if (env.platform !== 'linux' || !SUPPORTED_ARCHES.has(env.arch)) {
    add('update.gate.platform')
  }
  if (isContainerized(env)) {
    add('update.gate.containerized')
  }
  try {
    accessSync(env.binaryDir, constants.W_OK)
  } catch {
    add('update.gate.unwritable')
  }
  if (env.appVersion.includes('-dev')) {
    add('update.gate.devBuild')
  }

  return {
    canSelfUpdate: reasonDescriptors.length === 0,
    reasons: reasonDescriptors.map((reason) => reason.fallbackMessage),
    reasonDescriptors,
  }
}
