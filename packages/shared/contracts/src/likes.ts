import { z } from 'zod'

// Likes wire family — the single Zod source the `@kobato/api` likes contract
// composes and the server validates against; consumers import these schemas,
// never a copy.

export const likeIncreaseInput = z.object({ key: z.string() })
export type LikeIncreaseInput = z.infer<typeof likeIncreaseInput>

export const likeIncreaseOutput = z.object({
  key: z.string(),
  likes: z.number().int().nonnegative(),
  token: z.string().optional(),
})
export type LikeIncreaseOutput = z.infer<typeof likeIncreaseOutput>

export const likeDecreaseInput = z.object({ key: z.string(), token: z.string() })
export type LikeDecreaseInput = z.infer<typeof likeDecreaseInput>

export const likeDecreaseOutput = z.object({
  key: z.string(),
  likes: z.number().int().nonnegative(),
})
export type LikeDecreaseOutput = z.infer<typeof likeDecreaseOutput>

export const likeValidateInput = z.object({ key: z.string(), token: z.string() })
export type LikeValidateInput = z.infer<typeof likeValidateInput>

export const likeValidateOutput = z.object({ key: z.string(), valid: z.boolean() })
export type LikeValidateOutput = z.infer<typeof likeValidateOutput>
