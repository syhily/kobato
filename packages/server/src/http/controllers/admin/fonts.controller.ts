import { adminFontsContract } from '@kobato/api/admin/fonts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { deleteFont, setFontSlot } from '@kobato/server/domains/fonts/services/mutate'
import { listFonts, toAdminFontDto } from '@kobato/server/domains/fonts/services/read'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/utils/id'

// `upload` lives in a separate Hono resource route (`fonts-package.ts`):
// (`fonts-package.ts`): 60 MiB sources exceed the oRPC bridge's body limit.
const impl = implementAdmin(adminFontsContract)

const list = impl.list.handler(async ({ context }) => ({ fonts: await listFonts(context.db) }))

const remove = impl.delete.handler(async ({ input, context }) => {
  const font = await deleteFont(context.db, input.fontId)
  recordAuditEventFromContext(context, {
    action: 'font_deleted',
    resourceType: 'font',
    resourceId: font.id,
    details: { familyName: font.familyName, hash: font.hash },
  })
  return { font: toAdminFontDto(font) }
})

const setSlot = impl.setSlot.handler(async ({ input, context }) => {
  await setFontSlot(context.db, input.slot, input.fontIds, context.viewer ? idFromString(context.viewer.id) : null)
  recordAuditEventFromContext(context, {
    action: 'font_slot_updated',
    resourceType: 'font',
    resourceId: input.slot,
    details: { fontIds: input.fontIds },
  })
  return undefined
})

export const adminFontsRouter = impl.router({
  list,
  delete: remove,
  setSlot,
})
