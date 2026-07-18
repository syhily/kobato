import { z } from 'zod'

// Payload for the admin "send test email" button — independent of the
// section-update channel because the action is a side-effect, not a
// document write.
export const sendTestMailSchema = z.object({
  to: z.email(),
})
