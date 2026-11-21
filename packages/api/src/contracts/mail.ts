import { z } from 'zod'

export const adminMailSendTestInput = z.object({ to: z.email() })
export type AdminMailSendTestInput = z.infer<typeof adminMailSendTestInput>

export const adminMailSendTestOutputDto = z.object({ success: z.boolean() })
export type AdminMailSendTestOutput = z.infer<typeof adminMailSendTestOutputDto>
