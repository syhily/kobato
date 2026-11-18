import {
  adminFontDeleteInput,
  adminFontDeleteOutputDto,
  adminFontsListInput,
  adminFontSetSlotOutputDto,
  listFontsOutputDto,
  setFontSlotInputDto,
} from '@kobato/contracts/fonts.ts'
import { oc } from '@orpc/contract'

// Admin fonts RPC contract — admin base on the server. `upload` lives in a
// separate Hono resource route (60 MiB sources exceed the oRPC bridge's body
// limit) and is deliberately absent here.
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
