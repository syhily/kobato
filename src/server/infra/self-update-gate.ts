// Self-update gate — each failed check appends one English technical reason
// (doctor/log output) plus its typed admin-facing descriptor.

import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { isSea } from '@/server/infra/sea'
import { APP_VERSION } from '@/shared/config/version'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

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

function isContainerized(): boolean {
  if (existsSync('/.dockerenv')) {
    return true
  }
  try {
    return CONTAINER_CGROUP_PATTERN.test(readFileSync('/proc/1/cgroup', 'utf8'))
  } catch {
    // No /proc (non-linux) or unreadable — treat as not containerized.
    return false
  }
}

export function evaluateSelfUpdateGate(): SelfUpdateGateResult {
  const reasonDescriptors: ErrorMessageDescriptor[] = []
  const add = (messageKey: SelfUpdateGateReasonKey): void => {
    // These five keys carry no ICU arguments, so the English baseline value IS
    // the fallback. Reading the catalog directly keeps this module free of the
    // server translator/config graph — `sea-cli --version/--help` imports the
    // gate through `doctor` and must stay side-effect free.
    reasonDescriptors.push({ messageKey, fallbackMessage: uiMessagesEnUS[messageKey] })
  }

  if (!isSea()) {
    add('update.gate.notSea')
  }
  if (process.platform !== 'linux' || !SUPPORTED_ARCHES.has(process.arch)) {
    add('update.gate.platform')
  }
  if (isContainerized()) {
    add('update.gate.containerized')
  }
  try {
    accessSync(dirname(process.execPath), constants.W_OK)
  } catch {
    add('update.gate.unwritable')
  }
  if (APP_VERSION.includes('-dev')) {
    add('update.gate.devBuild')
  }

  return {
    canSelfUpdate: reasonDescriptors.length === 0,
    reasons: reasonDescriptors.map((reason) => reason.fallbackMessage),
    reasonDescriptors,
  }
}
