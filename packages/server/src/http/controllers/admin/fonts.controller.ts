import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { deleteFont, setFontSlot } from '@kobato/server/domains/fonts/services/mutate.ts'
import { listFonts, toAdminFontDto } from '@kobato/server/domains/fonts/services/read.ts'
import { adminProc } from '@kobato/server/http/orpc-base.ts'
import { adminFontDto, listFontsOutputDto, setFontSlotInputDto } from '@kobato/shared/contracts/fonts.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'
import { z } from 'zod'

// Admin font procedures. `upload` lives in a separate Hono resource route
// (`fonts-package.ts`): 60 MiB sources exceed the oRPC bridge's body limit.
const list = adminProc
  .route({ method: 'GET', path: '/admin/fonts/list' })
  .input(z.object({}).optional())
  .output(listFontsOutputDto)
  .handler(async ({ context }) => ({ fonts: await listFonts(context.db) }))

const remove = adminProc
  .route({ method: 'POST', path: '/admin/fonts/delete' })
  .input(z.object({ fontId: z.uuid() }))
  .output(z.object({ font: adminFontDto }))
  .handler(async ({ input, context }) => {
    const font = await deleteFont(context.db, input.fontId)
    recordAuditEventFromContext(context, {
      action: 'font_deleted',
      resourceType: 'font',
      resourceId: font.id,
      details: { familyName: font.familyName, hash: font.hash },
    })
    return { font: toAdminFontDto(font) }
  })

const setSlot = adminProc
  .route({ method: 'POST', path: '/admin/fonts/set-slot' })
  .input(setFontSlotInputDto)
  .output(z.object({}).optional())
  .handler(async ({ input, context }) => {
    await setFontSlot(context.db, input.slot, input.fontIds, context.viewer ? idFromString(context.viewer.id) : null)
    recordAuditEventFromContext(context, {
      action: 'font_slot_updated',
      resourceType: 'font',
      resourceId: input.slot,
      details: { fontIds: input.fontIds },
    })
    return undefined
  })

export const adminFontsRouter = {
  list,
  delete: remove,
  setSlot,
}
