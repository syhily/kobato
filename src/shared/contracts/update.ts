import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { UpdateCheckResult, UpdateJobState, UpdateJobStatus } from '@/shared/types/update'

export const updateCheckResultDto = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  tagName: z.string(),
  htmlUrl: z.string(),
  updateAvailable: z.boolean(),
  canSelfUpdate: z.boolean(),
  reasons: z.array(z.string()),
})

export const updateJobStateDto = z.enum(['idle', 'downloading', 'verifying', 'swapping', 'restarting', 'failed'])

export const updateJobStatusDto = z.object({
  state: updateJobStateDto,
  error: z.string().optional(),
  targetVersion: z.string().optional(),
})

// ─── parity assertions ─────────────────────────────────
type _updateCheckResultParity = Assert<Equals<z.infer<typeof updateCheckResultDto>, UpdateCheckResult>>
type _updateJobStateParity = Assert<Equals<z.infer<typeof updateJobStateDto>, UpdateJobState>>
type _updateJobStatusParity = Assert<Equals<z.infer<typeof updateJobStatusDto>, UpdateJobStatus>>
