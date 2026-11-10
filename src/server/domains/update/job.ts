// In-memory single-job state machine for self-update: one update at a time,
// no 'succeeded' state — on success the process restarts.

import { spawn } from 'node:child_process'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { UpdateJobStatus } from '@/shared/contracts/update'
import type { AppLocale } from '@/shared/i18n/locales'

import { runSelfUpdate } from '@/server/domains/update/pipeline'
import { carriesErrorMessageDescriptor, descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import { createServerTranslator } from '@/server/infra/i18n'
import { closeHttpServer, requestShutdown, restartServer } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'

const log = getLogger('update.job')

let current: UpdateJobStatus = { state: 'idle' }
// The pipeline's failures carry a descriptor; the status boundary localizes it
// per request (the VersionDialog renders the string, never a key).
let currentErrorDescriptor: ErrorMessageDescriptor | undefined

function errorDescriptorOf(err: unknown): ErrorMessageDescriptor | undefined {
  // Structural, not `instanceof DomainError`: the descriptor is the contract,
  // and a re-imported errors module must not defeat the lookup.
  return carriesErrorMessageDescriptor(err) ? err.descriptor : undefined
}

// Busy is derived: any state other than idle/failed holds the single-job
// slot. After success the state stays 'restarting' (the process restarts),
// which keeps the slot held forever — intentionally.
function isBusy(): boolean {
  return current.state !== 'idle' && current.state !== 'failed'
}

export function getUpdateJobStatus(locale: AppLocale = DEFAULT_LOCALE): UpdateJobStatus {
  if (current.state !== 'failed' || currentErrorDescriptor === undefined) {
    return current
  }
  const { messageKey, params } = currentErrorDescriptor
  return { ...current, error: createServerTranslator(locale).format(messageKey, params) }
}

// Self-restart after a successful binary swap. The listen socket MUST close
// before the replacement spawns; exit goes through `requestShutdown` so the
// batcher flush hooks run first.
function scheduleSelfRestart(): void {
  void (async () => {
    // 8s budget matches the graceful close in `performShutdown`.
    await closeHttpServer(8_000)
    // Respawn failure: re-bind the listener, release the job slot.
    const recover = async (err: unknown): Promise<void> => {
      const message = err instanceof Error ? err.message : String(err)
      log.error('self-update respawn failed; restoring the listener', { err: message })
      try {
        await restartServer()
      } catch (restartErr) {
        // Best-effort: a failed re-bind must not escape this detached IIFE.
        log.error('self-update listener restore failed', {
          err: restartErr instanceof Error ? restartErr.message : String(restartErr),
        })
      }
      currentErrorDescriptor = undefined
      current = { ...current, state: 'failed', error: message }
    }
    try {
      const child = spawn(process.execPath, process.argv.slice(1), {
        detached: true,
        stdio: 'inherit',
      })
      // Spawn failures arrive asynchronously via the child's 'error' event.
      child.on('error', (err) => {
        void recover(err)
      })
      child.unref()
      log.info('self-update swapped the binary; restarting', { pid: child.pid ?? null })
    } catch (err) {
      await recover(err)
      return
    }
    requestShutdown('self-update restart')
  })()
}

export interface StartUpdateJobOptions {
  /** Defaults to the detached-respawn restart; tests inject a spy. */
  restart?: () => void
}

export function startUpdateJob(tagName: string, options: StartUpdateJobOptions = {}): void {
  if (isBusy()) {
    throw new DomainError('CONFLICT', descriptorFor('update.error.jobRunning'))
  }
  currentErrorDescriptor = undefined
  current = { state: 'downloading', targetVersion: tagName }
  const restart = options.restart ?? scheduleSelfRestart

  void (async () => {
    try {
      await runSelfUpdate({
        tagName,
        onState: (state) => {
          current = { ...current, state }
        },
      })
      current = { ...current, state: 'restarting' }
      restart()
    } catch (err) {
      // L1 operational data only — no user content.
      log.error('self-update failed', {
        targetVersion: tagName,
        err: err instanceof Error ? err.message : String(err),
      })
      currentErrorDescriptor = errorDescriptorOf(err)
      current = {
        state: 'failed',
        error: err instanceof Error ? err.message : String(err),
        targetVersion: tagName,
      }
    }
  })()
}
