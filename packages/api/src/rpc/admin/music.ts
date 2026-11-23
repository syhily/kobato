import {
  addMusicOutputDto,
  adminMusicAddInput,
  adminMusicIdInput,
  adminMusicListInput,
  adminMusicSearchInput,
  adminMusicUpdateInput,
  getMusicOutputDto,
  listMusicOutputDto,
  searchMusicOutputDto,
  updateMusicOutputDto,
} from '@kobato/api/contracts/admin/music'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminMusicContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/music/list' })
    .input(adminMusicListInput)
    .output(listMusicOutputDto),
  search: defineProcedure({ method: 'GET', path: '/admin/music/search' })
    .input(adminMusicSearchInput)
    .output(searchMusicOutputDto),
  add: defineProcedure({ method: 'POST', path: '/admin/music/add' })
    .input(adminMusicAddInput)
    .output(addMusicOutputDto),
  get: defineProcedure({ method: 'GET', path: '/admin/music/get' }).input(adminMusicIdInput).output(getMusicOutputDto),
  update: defineProcedure({ method: 'POST', path: '/admin/music/update' })
    .input(adminMusicUpdateInput)
    .output(updateMusicOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/music/remove' }).input(adminMusicIdInput).output(voidOutput),
}
