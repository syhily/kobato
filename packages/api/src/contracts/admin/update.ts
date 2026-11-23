import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'

import { z } from 'zod'

export const updateCheckResultDto = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  tagName: z.string(),
  htmlUrl: z.string(),
  updateAvailable: z.boolean(),
  canSelfUpdate: z.boolean(),
  reasons: z.array(z.custom<ErrorMessageDescriptor>()),
})
export type UpdateCheckResult = z.infer<typeof updateCheckResultDto>

export const updateJobStateDto = z.enum(['idle', 'downloading', 'verifying', 'swapping', 'restarting', 'failed'])
export type UpdateJobState = z.infer<typeof updateJobStateDto>

export const updateJobStatusDto = z.object({
  state: updateJobStateDto,
  error: z.string().optional(),
  targetVersion: z.string().optional(),
})
export type UpdateJobStatus = z.infer<typeof updateJobStatusDto>

export const adminUpdateApplyInput = z.object({})
export type AdminUpdateApplyInput = z.infer<typeof adminUpdateApplyInput>

export const adminUpdateApplyOutputDto = z.object({ fromVersion: z.string(), toVersion: z.string() })
export type AdminUpdateApplyOutput = z.infer<typeof adminUpdateApplyOutputDto>

export const adminUpdateCheckInput = z.object({})
export type AdminUpdateCheckInput = z.infer<typeof adminUpdateCheckInput>

export const adminUpdateStatusInput = z.object({})
export type AdminUpdateStatusInput = z.infer<typeof adminUpdateStatusInput>
