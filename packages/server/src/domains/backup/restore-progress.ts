import type { RestoreProgressDto } from '@kobato/contracts/backup.ts'

import { peekRestoreJobPhase } from '@kobato/server/domains/backup/restore-machine.ts'

interface StagingProgress {
  stage: 'decrypting' | 'extracting'
  doneBytes: number
  totalBytes: number | null
}

let claimed = false
let staging: StagingProgress | null = null

export function beginStagingProgress(): boolean {
  if (claimed) {
    return false
  }
  claimed = true
  staging = null
  return true
}

export function reportStagingProgress(
  stage: 'decrypting' | 'extracting',
  doneBytes: number,
  totalBytes: number | null,
): void {
  if (!claimed) {
    return
  }
  staging = { stage, doneBytes, totalBytes }
}

export function endStagingProgress(): void {
  claimed = false
  staging = null
}

export function resetStagingProgress(): void {
  endStagingProgress()
}

export function peekRestoreProgress(): RestoreProgressDto {
  if (staging !== null) {
    const percent =
      staging.totalBytes !== null && staging.totalBytes > 0
        ? Math.min(99, Math.round((staging.doneBytes / staging.totalBytes) * 100))
        : null
    return { stage: staging.stage, percent }
  }
  const machine = peekRestoreJobPhase()
  if (machine.phase === 'idle') {
    return { stage: 'idle', percent: null }
  }
  return { stage: machine.phase, percent: null, error: machine.error }
}
