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
} from '@kobato/contracts/music'
import { voidOutput } from '@kobato/contracts/primitives'
import { oc } from '@orpc/contract'

export const adminMusicContract = {
  list: oc.route({ method: 'GET', path: '/admin/music/list' }).input(adminMusicListInput).output(listMusicOutputDto),
  search: oc
    .route({ method: 'GET', path: '/admin/music/search' })
    .input(adminMusicSearchInput)
    .output(searchMusicOutputDto),
  add: oc.route({ method: 'POST', path: '/admin/music/add' }).input(adminMusicAddInput).output(addMusicOutputDto),
  get: oc.route({ method: 'GET', path: '/admin/music/get' }).input(adminMusicIdInput).output(getMusicOutputDto),
  update: oc
    .route({ method: 'POST', path: '/admin/music/update' })
    .input(adminMusicUpdateInput)
    .output(updateMusicOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/music/remove' }).input(adminMusicIdInput).output(voidOutput),
}
