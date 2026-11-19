import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'
import type { UpdateJobStatus } from '@kobato/contracts/update.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'

import { DEFAULT_LOCALE } from '@kobato/i18n/locales.ts'
import { runSelfUpdate } from '@kobato/server/domains/update/pipeline.ts'
import { carriesErrorMessageDescriptor, descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { closeHttpServer, requestShutdown, restartServer } from '@kobato/server/infra/lifecycle.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { spawn } from 'node:child_process'

const log = getLogger('update.job')

let current: UpdateJobStatus = { state: 'idle' }
let currentErrorDescriptor: ErrorMessageDescriptor | undefined

function errorDescriptorOf(err: unknown): ErrorMessageDescriptor | undefined {
  return carriesErrorMessageDescriptor(err) ? err.descriptor : undefined
}

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

function scheduleSelfRestart(): void {
  void (async () => {
    await closeHttpServer(8_000)
    const recover = async (err: unknown): Promise<void> => {
      const message = err instanceof Error ? err.message : String(err)
      log.error('self-update respawn failed; restoring the listener', { err: message })
      try {
        await restartServer()
      } catch (restartErr) {
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
