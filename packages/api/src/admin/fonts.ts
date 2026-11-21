import {
  adminFontDeleteInput,
  adminFontDeleteOutputDto,
  adminFontsListInput,
  adminFontSetSlotOutputDto,
  listFontsOutputDto,
  setFontSlotInputDto,
} from '@kobato/contracts/fonts'
import { oc } from '@orpc/contract'

export const adminFontsContract = {
  list: oc.route({ method: 'GET', path: '/admin/fonts/list' }).input(adminFontsListInput).output(listFontsOutputDto),
  delete: oc
    .route({ method: 'POST', path: '/admin/fonts/delete' })
    .input(adminFontDeleteInput)
    .output(adminFontDeleteOutputDto),
  setSlot: oc
    .route({ method: 'POST', path: '/admin/fonts/set-slot' })
    .input(setFontSlotInputDto)
    .output(adminFontSetSlotOutputDto),
}
