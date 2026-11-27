import { adminFontsContract } from '@kobato/api/rpc/admin/fonts'
import { idFromString } from '@kobato/base/utils/id'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { uploadCanvasFont } from '@kobato/server/domains/fonts/services/canvas-upload'
import { deleteFont, setFontSlot } from '@kobato/server/domains/fonts/services/mutate'
import { listFonts, toAdminFontDto } from '@kobato/server/domains/fonts/services/read'
import { uploadFont } from '@kobato/server/domains/fonts/services/upload'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { getLogger } from '@kobato/server/infra/logger'
import { resetCanvasFont, resetFontCache } from '@kobato/server/render/canvas-fonts'

const log = getLogger('fonts.controller')

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

const upload = impl.upload.handler(async ({ input, context }) => {
  const buffer = new Uint8Array(await input.file.arrayBuffer())
  const font = await uploadFont(context.db, {
    buffer,
    sourceName: input.file.name || 'font.ttf',
    familyName: input.familyName,
  })
  recordAuditEventFromContext(context, {
    action: 'font_uploaded',
    resourceType: 'font',
    resourceId: font.id,
    details: { familyName: font.familyName, hash: font.hash, size: buffer.length },
  })
  log.info('Font package uploaded', { id: font.id, familyName: font.familyName, size: buffer.length })
  return { font }
})

const uploadCanvas = impl.uploadCanvas.handler(async ({ input, context }) => {
  const result = await uploadCanvasFont(input.file, input.slot)
  resetFontCache()
  resetCanvasFont(input.slot)
  recordAuditEventFromContext(context, {
    action: 'font_uploaded',
    resourceType: 'font',
    resourceId: input.slot,
    details: { size: result.size, contentType: result.contentType },
  })
  log.info('Canvas font uploaded', { slot: input.slot, size: result.size, dest: result.destination })
  return { slot: result.slot, size: result.size }
})

export const adminFontsRouter = impl.router({
  list,
  delete: remove,
  setSlot,
  upload,
  uploadCanvas,
})
