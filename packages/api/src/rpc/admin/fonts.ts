import {
  CANVAS_FONT_MAX_BYTES,
  FONT_MAX_BYTES,
  adminCanvasFontUploadInput,
  adminCanvasFontUploadOutputDto,
  adminFontDeleteInput,
  adminFontDeleteOutputDto,
  adminFontsListInput,
  adminFontSetSlotOutputDto,
  adminFontUploadInput,
  adminFontUploadOutputDto,
  listFontsOutputDto,
  setFontSlotInputDto,
} from '@kobato/api/contracts/admin/fonts'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminFontsContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/fonts/list' })
    .input(adminFontsListInput)
    .output(listFontsOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/fonts/delete' })
    .input(adminFontDeleteInput)
    .output(adminFontDeleteOutputDto),
  setSlot: defineProcedure({ method: 'POST', path: '/admin/fonts/set-slot' })
    .input(setFontSlotInputDto)
    .output(adminFontSetSlotOutputDto),
  upload: defineProcedure(
    { method: 'POST', path: '/admin/fonts/package/upload' },
    {
      requestBodyLimit: {
        maxBytes: FONT_MAX_BYTES,
        messageKey: 'fonts.error.packageTooLarge',
        formatMaxBytes: true,
      },
    },
  )
    .input(adminFontUploadInput)
    .output(adminFontUploadOutputDto),
  uploadCanvas: defineProcedure(
    { method: 'POST', path: '/admin/fonts/upload' },
    { requestBodyLimit: { maxBytes: CANVAS_FONT_MAX_BYTES, messageKey: 'common.error.uploadTooLarge' } },
  )
    .input(adminCanvasFontUploadInput)
    .output(adminCanvasFontUploadOutputDto),
}
