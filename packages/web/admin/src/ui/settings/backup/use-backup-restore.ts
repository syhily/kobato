import type { RestoreProgressDto, RestoreProgressStage } from '@kobato/api/contracts/backup'
import type { RestoreStep } from '@kobato/web-admin/ui/settings/backup/RestoreProgressPanel'
import type { ToastTranslator } from '@kobato/web-public/ui/lib/toast-api-error'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { extractApiErrorMessage } from '@kobato/web-client/lib/api-error'
import { toastApiError } from '@kobato/web-public/ui/lib/toast-api-error'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const PROGRESS_POLL_MS = 500
const READY_POLL_MS = 2000
const READY_MAX_ATTEMPTS = 150

interface XhrResult {
  status: number
  json: unknown
}

function uploadWithProgress(
  url: string,
  file: File,
  csrfToken: string | undefined,
  onProgress: (percent: number) => void,
  xhrRef: { current: XMLHttpRequest | null },
  errorMessages: { network: string; aborted: string },
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('POST', url)
    if (csrfToken) {
      xhr.setRequestHeader('x-csrf-token', csrfToken)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onload = () => {
      xhrRef.current = null
      try {
        resolve({ status: xhr.status, json: JSON.parse(xhr.responseText) })
      } catch {
        resolve({ status: xhr.status, json: null })
      }
    }
    xhr.onerror = () => {
      xhrRef.current = null
      reject(new Error(errorMessages.network))
    }
    xhr.onabort = () => {
      xhrRef.current = null
      reject(new DOMException(errorMessages.aborted, 'AbortError'))
    }
    const formData = new FormData()
    formData.append('file', file)
    xhr.send(formData)
  })
}

function isUploadAccepted(json: unknown): boolean {
  return typeof json === 'object' && json !== null && 'accepted' in json && json.accepted === true
}

function readEncryptedToken(json: unknown): string | null {
  if (typeof json === 'object' && json !== null && 'encrypted' in json && json.encrypted === true) {
    return 'token' in json && typeof json.token === 'string' ? json.token : null
  }
  return null
}

const PROGRESS_STAGES: readonly RestoreProgressStage[] = [
  'decrypting',
  'extracting',
  'draining',
  'restoring',
  'completed',
  'failed',
  'idle',
]

function parseRestoreProgressDto(json: unknown): RestoreProgressDto | null {
  if (typeof json !== 'object' || json === null || !('stage' in json)) {
    return null
  }
  const stage = PROGRESS_STAGES.find((value) => value === json.stage)
  if (stage === undefined) {
    return null
  }
  const percent = 'percent' in json && typeof json.percent === 'number' ? json.percent : null
  const error = 'error' in json && typeof json.error === 'string' ? json.error : undefined
  return { stage, percent, error }
}

async function pollRestoreProgress(
  signal: AbortSignal,
  onDto: (dto: RestoreProgressDto) => void,
  onGiveUp?: () => void,
): Promise<void> {
  let failures = 0
  while (!signal.aborted) {
    try {
      const res = await fetch('/api/admin/backup/restore-progress', { cache: 'no-store', signal })
      if (!res.ok) {
        failures += 1
      } else {
        const dto = parseRestoreProgressDto(await res.json())
        if (dto !== null) {
          failures = 0
          onDto(dto)
        }
      }
    } catch {
      if (!signal.aborted) {
        failures += 1
      }
    }
    if (failures >= 5) {
      onGiveUp?.()
      return
    }
    await new Promise<void>((resolve) => setTimeout(resolve, PROGRESS_POLL_MS))
  }
}

async function probeRestoreMachineActive(signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/backup/restore-progress', { cache: 'no-store', signal })
    if (!res.ok) {
      return false
    }
    const dto = parseRestoreProgressDto(await res.json())
    return dto !== null && (dto.stage === 'draining' || dto.stage === 'restoring' || dto.stage === 'completed')
  } catch {
    return false
  }
}

export async function waitForRestartAndReport(signal: AbortSignal, t: ToastTranslator): Promise<boolean> {
  for (let attempt = 0; attempt < READY_MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      return false
    }
    try {
      const res = await fetch('/ready', { cache: 'no-store', signal })
      if (res.ok) {
        let reported = false
        for (let read = 0; read < 5 && !reported && !signal.aborted; read++) {
          try {
            const statusRes = await fetch('/api/admin/backup/restore-status', { cache: 'no-store', signal })
            if (statusRes.ok) {
              const status: unknown = await statusRes.json()
              if (typeof status === 'object' && status !== null && 'phase' in status) {
                if (status.phase === 'completed') {
                  const configApplied =
                    'configApplied' in status && typeof status.configApplied === 'boolean' && status.configApplied
                  toast.success(
                    t(
                      configApplied
                        ? 'admin.settings.backup.restore.configApplied'
                        : 'admin.settings.backup.restore.done',
                    ),
                  )
                  reported = true
                } else if (status.phase === 'failed') {
                  const error = 'error' in status && typeof status.error === 'string' ? status.error : undefined
                  toastApiError(error, 'admin.toast.restoreFailed', t)
                  reported = true
                }
              }
            }
          } catch {}
          if (!reported) {
            await new Promise<void>((resolve) => setTimeout(resolve, 800))
          }
        }
        if (signal.aborted) {
          return false
        }
        if (!reported) {
          toast(t('admin.settings.backup.restore.serviceRecovered'))
        }
        window.location.reload()
        return true
      }
    } catch {}
    await new Promise<void>((resolve) => setTimeout(resolve, READY_POLL_MS))
  }
  if (!signal.aborted) {
    toast.error(t('admin.settings.backup.restore.timeout'))
  }
  return false
}

export interface UploadRestoreState {
  active: boolean
  step: RestoreStep
  percent: number | null
  hasDecrypt: boolean
  pendingToken: string | null
  pendingFileName: string | null
  passwordPending: boolean
}

const IDLE_STATE: UploadRestoreState = {
  active: false,
  step: 'uploading',
  percent: null,
  hasDecrypt: false,
  pendingToken: null,
  pendingFileName: null,
  passwordPending: false,
}

export function useBackupUploadRestore({ csrfToken }: { csrfToken: string | undefined }) {
  const { t } = useI18n()
  const [state, setState] = useState<UploadRestoreState>(IDLE_STATE)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pollRef = useRef<AbortController | null>(null)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const xhrSlot = xhrRef
    const abortSlot = abortRef
    const pollSlot = pollRef
    return () => {
      xhrSlot.current?.abort()
      abortSlot.current?.abort()
      pollSlot.current?.abort()
    }
  }, [])

  const stopPolling = useCallback(() => {
    pollRef.current?.abort()
    pollRef.current = null
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    const controller = new AbortController()
    pollRef.current = controller
    void pollRestoreProgress(
      controller.signal,
      (dto) => {
        setState((current) => {
          if (!current.active) {
            return current
          }
          if (current.step !== 'uploading' && current.step !== 'decrypting' && current.step !== 'extracting') {
            return current
          }
          if (dto.stage === 'decrypting') {
            return { ...current, step: 'decrypting', percent: dto.percent }
          }
          if (dto.stage === 'extracting') {
            return { ...current, step: 'extracting', percent: null }
          }
          return current
        })
      },
      () => {
        if (!controller.signal.aborted) {
          toast(t('admin.settings.backup.restore.progressStale'), { id: 'backup-progress-stale' })
        }
      },
    )
  }, [stopPolling, t])

  const reset = useCallback(() => {
    tokenRef.current = null
    abortRef.current?.abort()
    abortRef.current = null
    stopPolling()
    setState(IDLE_STATE)
  }, [stopPolling])

  const enterTail = useCallback(() => {
    stopPolling()
    setState((prev) => ({ ...prev, pendingToken: null, pendingFileName: null, step: 'switching', percent: null }))
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    void (async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000))
      setState((prev) => (prev.active && prev.step === 'switching' ? { ...prev, step: 'restarting' } : prev))
      const done = await waitForRestartAndReport(signal, t)
      if (!done) {
        reset()
      }
    })()
  }, [reset, stopPolling, t])

  const startUpload = useCallback(
    (file: File) => {
      setState({ ...IDLE_STATE, active: true, step: 'uploading', percent: 0 })
      startPolling()
      void (async () => {
        let result: XhrResult
        try {
          result = await uploadWithProgress(
            '/api/admin/backup/upload-restore',
            file,
            csrfToken,
            (percent) => setState((prev) => (prev.active && prev.step === 'uploading' ? { ...prev, percent } : prev)),
            xhrRef,
            {
              network: t('admin.settings.backup.restore.networkError'),
              aborted: t('admin.settings.backup.restore.aborted'),
            },
          )
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
          toastApiError(error, 'admin.toast.restoreUploadFailed', t)
          reset()
          return
        }
        const { status, json } = result
        if (status === 200 && isUploadAccepted(json)) {
          enterTail()
          return
        }
        if (status === 200) {
          const token = readEncryptedToken(json)
          if (token !== null) {
            stopPolling()
            tokenRef.current = token
            setState((prev) => ({
              ...prev,
              step: 'decrypting',
              percent: null,
              hasDecrypt: true,
              pendingToken: token,
              pendingFileName: file.name,
            }))
            return
          }
        }
        toastApiError(
          new Error(extractApiErrorMessage(json) ?? t('admin.settings.backup.restore.uploadFailed')),
          'admin.toast.restoreUploadFailed',
          t,
        )
        reset()
      })()
    },
    [csrfToken, enterTail, reset, startPolling, stopPolling, t],
  )

  const submitPassword = useCallback(
    (password: string) => {
      const token = tokenRef.current
      if (token === null) {
        return
      }
      setState((prev) => ({ ...prev, passwordPending: true }))
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      const signal = abortRef.current.signal
      startPolling()
      void (async () => {
        let res: Response
        try {
          res = await fetch('/api/admin/backup/upload-restore/decrypt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify({ token, password }),
            signal,
          })
        } catch (error) {
          if (signal.aborted) {
            return
          }
          stopPolling()
          if (await probeRestoreMachineActive(signal)) {
            enterTail()
            return
          }
          toastApiError(error, 'admin.toast.restoreUploadFailed', t)
          reset()
          return
        }
        const json: unknown = await res.json().catch(() => null)
        if (res.ok && isUploadAccepted(json)) {
          enterTail()
          return
        }
        stopPolling()
        if (res.status === 410) {
          toastApiError(
            new Error(extractApiErrorMessage(json) ?? t('admin.settings.backup.restore.expired')),
            'admin.toast.restoreFailed',
            t,
          )
          reset()
          return
        }
        toastApiError(
          new Error(extractApiErrorMessage(json) ?? t('admin.settings.backup.restore.failed')),
          'admin.toast.restoreFailed',
          t,
        )
        setState((current) => (current.active ? { ...current, passwordPending: false } : current))
      })()
    },
    [csrfToken, enterTail, reset, startPolling, stopPolling, t],
  )

  const cancelPending = useCallback(() => {
    abortRef.current?.abort()
    reset()
  }, [reset])

  return { state, startUpload, submitPassword, cancelPending, reset }
}
