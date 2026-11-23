import {
  addMusicOutputDto,
  adminMusicAddInput,
  adminMusicIdInput,
  adminMusicListInput,
  adminMusicProxyInput,
  adminMusicProxyOutput,
  adminMusicSearchInput,
  adminMusicUpdateInput,
  getMusicOutputDto,
  listMusicOutputDto,
  searchMusicOutputDto,
  updateMusicOutputDto,
} from '@kobato/api/contracts/admin/music'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const ADMIN_MUSIC_PROXY_COVER_RPC_PATH = '/rpc/admin/music/proxyCover'
export const ADMIN_MUSIC_PROXY_AUDIO_RPC_PATH = '/rpc/admin/music/proxyAudio'

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
  proxyCover: defineProcedure({ method: 'GET', path: '/admin/music/proxy/cover' }, { csrfExempt: true })
    .input(adminMusicProxyInput)
    .output(adminMusicProxyOutput),
  proxyAudio: defineProcedure({ method: 'GET', path: '/admin/music/proxy/audio' }, { csrfExempt: true })
    .input(adminMusicProxyInput)
    .output(adminMusicProxyOutput),
}
