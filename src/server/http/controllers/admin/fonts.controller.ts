import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { deleteFont, setFontSlot } from '@/server/domains/fonts/services/mutate'
import { listFonts, toAdminFontDto } from '@/server/domains/fonts/services/read'
import { adminProc } from '@/server/http/orpc-base'
import { adminFontDto, listFontsOutputDto, setFontSlotInputDto } from '@/shared/contracts/fonts'
import { idFromString } from '@/shared/utils/id'

// Admin font library + slot-assignment procedures. The `list` / `delete` /
// `setSlot` procedures are admin-gated oRPC routes. The `upload` procedure
// intentionally lives in a separate Hono resource route
// (`src/server/http/resources/fonts-package.ts`) rather than here, because a
// font source file can be 60 MiB and the oRPC bridge sits behind the
// request-wide body limit (default 10 MB). A dedicated resource route with
// its own `bodyLimit` mirrors the existing canvas-font upload at
// `resources/fonts.ts` and the image-upload exception documented in
// `middleware-pipeline.ts`.

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
    await setFontSlot(
      context.db,
      context.pool,
      input.slot,
      input.fontIds,
      context.viewer ? idFromString(context.viewer.id) : null,
    )
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
