import {
  adminFontDeleteInput,
  adminFontDeleteOutputDto,
  adminFontsListInput,
  adminFontSetSlotOutputDto,
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
}
