import { z } from 'zod'

// Admin mail wire — the single Zod source the `@kobato/api` mail contract
// composes and the server validates against.

export const adminMailSendTestInput = z.object({ to: z.email() })
export type AdminMailSendTestInput = z.infer<typeof adminMailSendTestInput>

export const adminMailSendTestOutputDto = z.object({ success: z.boolean() })
export type AdminMailSendTestOutput = z.infer<typeof adminMailSendTestOutputDto>
