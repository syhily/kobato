import { z } from 'zod'

export const updateCheckResultDto = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  tagName: z.string(),
  htmlUrl: z.string(),
  updateAvailable: z.boolean(),
  canSelfUpdate: z.boolean(),
  /** Admin-facing refusal reasons (Chinese) when `canSelfUpdate` is false. */
  reasons: z.array(z.string()),
})
export type UpdateCheckResult = z.infer<typeof updateCheckResultDto>

// `'succeeded'` is intentionally unreachable: the process exits on success
// and the UI infers the outcome from the version change after reload.
export const updateJobStateDto = z.enum(['idle', 'downloading', 'verifying', 'swapping', 'restarting', 'failed'])
export type UpdateJobState = z.infer<typeof updateJobStateDto>

export const updateJobStatusDto = z.object({
  state: updateJobStateDto,
  error: z.string().optional(),
  targetVersion: z.string().optional(),
})
export type UpdateJobStatus = z.infer<typeof updateJobStatusDto>
