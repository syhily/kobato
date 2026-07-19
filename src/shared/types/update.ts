// SEA self-update DTOs (plan 090). Wire shapes are parity-checked against
// `src/shared/contracts/update.ts`.

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  tagName: string
  htmlUrl: string
  updateAvailable: boolean
  canSelfUpdate: boolean
  /** Admin-facing refusal reasons (Chinese) when `canSelfUpdate` is false. */
  reasons: string[]
}

// `'succeeded'` is intentionally unreachable: the process exits on success
// and the UI infers the outcome from the version change after reload.
export type UpdateJobState = 'idle' | 'downloading' | 'verifying' | 'swapping' | 'restarting' | 'failed'

export interface UpdateJobStatus {
  state: UpdateJobState
  error?: string
  targetVersion?: string
}
