import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { RestoreProgressDto, RestoreProgressStage } from '@/shared/types/backup'
import type { RestoreStep } from '@/ui/admin/settings/RestoreProgressPanel'

import { toastApiError } from '@/client/lib/toast-api-error'
import { extractApiErrorMessage } from '@/shared/utils/api-error'

const PROGRESS_POLL_MS = 500
const READY_POLL_MS = 2000
const READY_MAX_ATTEMPTS = 150

interface XhrResult {
  status: number
  json: unknown
}

/** XHR, not fetch: only XHR exposes real upload progress events. */
function uploadWithProgress(
  url: string,
  file: File,
  csrfToken: string | undefined,
  onProgress: (percent: number) => void,
  xhrRef: { current: XMLHttpRequest | null },
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
      reject(new Error('网络错误，上传失败'))
    }
    xhr.onabort = () => {
      xhrRef.current = null
      reject(new DOMException('上传已取消', 'AbortError'))
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

/** Narrow the wire payload to the progress DTO; anything off-shape is dropped. */
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

/** Poll the merged staging/machine progress while a staging request runs.
 *  Tolerates a burst of transient failures (the drain closes the listener
 *  around the swap) before giving up with an `onGiveUp` notice. */
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

/** After a decrypt/upload response dies on the wire: did the server accept
 *  the restore anyway? The swap closes the listener seconds later, so a
 *  machine phase of draining/restoring/completed means "yes". */
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

/** Wait out the server restart, then read the one-shot terminal report and
 *  toast the outcome. Returns false on timeout/abort (caller resets UI). */
export async function waitForRestartAndReport(signal: AbortSignal): Promise<boolean> {
  for (let attempt = 0; attempt < READY_MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      return false
    }
    try {
      const res = await fetch('/ready', { cache: 'no-store', signal })
      if (res.ok) {
        // The terminal report is consumed once; the job may still be flipping
        // to its terminal phase right after the restart, so retry briefly
        // before falling back to a neutral notice.
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
                  toast.success(configApplied ? '备份已还原；配置文件已替换，将在下次重启后生效' : '备份已还原')
                  reported = true
                } else if (status.phase === 'failed') {
                  const error = 'error' in status && typeof status.error === 'string' ? status.error : undefined
                  toastApiError(error, '还原失败')
                  reported = true
                }
              }
            }
          } catch {
            // The status read is best-effort; the server is up either way.
          }
          if (!reported) {
            await new Promise<void>((resolve) => setTimeout(resolve, 800))
          }
        }
        // Aborted mid-report (the caller navigated away) — leave quietly:
        // no toast, no forced reload dragging the user back.
        if (signal.aborted) {
          return false
        }
        if (!reported) {
          toast('服务已恢复，正在刷新页面')
        }
        window.location.reload()
        return true
      }
    } catch {
      // Network errors during the restart are expected; keep polling.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, READY_POLL_MS))
  }
  if (!signal.aborted) {
    toast.error('等待服务重启超时，请手动刷新页面。')
  }
  return false
}

export interface UploadRestoreState {
  active: boolean
  step: RestoreStep
  percent: number | null
  hasDecrypt: boolean
  /** Encrypted upload parked server-side, waiting for the password prompt. */
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

/** The upload-restore flow state machine: XHR upload (real percent) →
 *  optional password round-trip for encrypted backups (server-reported
 *  decrypt/extract progress) → swap → restart wait → reload. */
export function useBackupUploadRestore({ csrfToken }: { csrfToken: string | undefined }) {
  const [state, setState] = useState<UploadRestoreState>(IDLE_STATE)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pollRef = useRef<AbortController | null>(null)
  // Mirror of state.pendingToken so async flows read it outside updaters.
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    // Copy the ref OBJECTS (stable) so the cleanup never reads .current off a render-scope ref.
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

  /** Server-side staging progress (decrypt %, extraction) rides along while
   *  the upload / decrypt request is in flight. */
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
        // The poller died silently otherwise — the panel would spin forever.
        if (!controller.signal.aborted) {
          toast('进度更新中断，还原仍在后台进行', { id: 'backup-progress-stale' })
        }
      },
    )
  }, [stopPolling])

  const reset = useCallback(() => {
    tokenRef.current = null
    // Abort the restart-wait tail too — a reset must stop EVERY async leg,
    // or a later waitForRestartAndReport would reload the page anyway.
    abortRef.current?.abort()
    abortRef.current = null
    stopPolling()
    setState(IDLE_STATE)
  }, [stopPolling])

  /** Shared tail: the restore chain is running server-side; wait it out. */
  const enterTail = useCallback(() => {
    stopPolling()
    setState((prev) => ({ ...prev, pendingToken: null, pendingFileName: null, step: 'switching', percent: null }))
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    void (async () => {
      // Give the swap leg a visible beat before the restart wait takes over.
      await new Promise<void>((resolve) => setTimeout(resolve, 2000))
      setState((prev) => (prev.active && prev.step === 'switching' ? { ...prev, step: 'restarting' } : prev))
      const done = await waitForRestartAndReport(signal)
      if (!done) {
        reset()
      }
    })()
  }, [reset, stopPolling])

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
          )
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
          toastApiError(error, '上传还原失败')
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
            // Encrypted archive parked server-side — ask for the password.
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
        toastApiError(new Error(extractApiErrorMessage(json) ?? '上传还原失败'), '上传还原失败')
        reset()
      })()
    },
    [csrfToken, enterTail, reset, startPolling, stopPolling],
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
          // The response may have died on the wire AFTER the server accepted
          // the restore — probe the machine before declaring failure.
          if (await probeRestoreMachineActive(signal)) {
            enterTail()
            return
          }
          toastApiError(error, '上传还原失败')
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
          // The parked upload expired or was evicted — back to the upload step.
          toastApiError(new Error(extractApiErrorMessage(json) ?? '备份已过期，请重新上传'), '还原失败')
          reset()
          return
        }
        // Wrong password (or a transient conflict): stay on the prompt for a retry.
        toastApiError(new Error(extractApiErrorMessage(json) ?? '还原失败'), '还原失败')
        setState((current) => (current.active ? { ...current, passwordPending: false } : current))
      })()
    },
    [csrfToken, enterTail, reset, startPolling, stopPolling],
  )

  /** Give up on the password prompt — the parked upload expires server-side. */
  const cancelPending = useCallback(() => {
    abortRef.current?.abort()
    reset()
  }, [reset])

  return { state, startUpload, submitPassword, cancelPending, reset }
}
