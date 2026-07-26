import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { findMusicDtoById, listMusicForAdmin } from '@/server/domains/music/services/read'
import { searchMusic } from '@/server/domains/music/services/search'
import { addMusic } from '@/server/domains/music/services/write/add'
import { deleteMusic } from '@/server/domains/music/services/write/delete'
import { updateMusicMetadata } from '@/server/domains/music/services/write/metadata'
import { authorProc } from '@/server/http/orpc-base'
import {
  addMusicOutputDto,
  getMusicOutputDto,
  listMusicOutputDto,
  searchMusicOutputDto,
  updateMusicOutputDto,
} from '@/shared/contracts/music'
import { idFromString } from '@/shared/utils/id'

const list = authorProc
  .route({ method: 'GET', path: '/admin/music/list' })
  .input(
    z.object({
      q: z.string().optional(),
      offset: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'artist', 'album']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }),
  )
  .output(listMusicOutputDto)
  .handler(({ input, context }) =>
    listMusicForAdmin(context.db, {
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    }),
  )

const search = authorProc
  .route({ method: 'GET', path: '/admin/music/search' })
  .input(
    z.object({
      source: z.enum(['netease', 'tencent']).optional(),
      keyword: z.string(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    }),
  )
  .output(searchMusicOutputDto)
  .handler(({ input, context: _context }) =>
    searchMusic(input.source ?? 'netease', input.keyword, input.limit, input.offset),
  )

const add = authorProc
  .route({ method: 'POST', path: '/admin/music/add' })
  .input(z.object({ source: z.enum(['netease', 'tencent']), sourceId: z.string().trim().min(1).max(64) }))
  .output(addMusicOutputDto)
  .handler(async ({ input, context }) => {
    const music = await addMusic(context.db, {
      source: input.source,
      sourceId: input.sourceId,
      uploader: {
        id: idFromString(context.viewer.id),
        name: context.viewer.name,
      },
    })
    recordAuditEventFromContext(context, {
      action: 'music_added',
      resourceType: 'music',
      resourceId: String(music.id),
    })
    return { music }
  })

const update = authorProc
  .route({ method: 'POST', path: '/admin/music/update' })
  .input(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(200),
      artist: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
      album: z.string().trim().max(200).optional().default(''),
      lyric: z.string().max(50_000).optional(),
    }),
  )
  .output(updateMusicOutputDto)
  .handler(async ({ input, context }) => {
    const music = await updateMusicMetadata(
      context.db,
      {
        id: idFromString(input.id),
        name: input.name,
        artist: input.artist,
        album: input.album,
        lyric: input.lyric ?? null,
      },
      {
        id: context.viewer.id,
        role: context.viewer.role,
      },
    )
    recordAuditEventFromContext(context, {
      action: 'music_updated',
      resourceType: 'music',
      resourceId: input.id,
    })
    return { music }
  })

const get = authorProc
  .route({ method: 'GET', path: '/admin/music/get' })
  .input(z.object({ id: z.string().min(1) }))
  .output(getMusicOutputDto)
  .handler(async ({ input, context }) => {
    const music = await findMusicDtoById(context.db, idFromString(input.id))
    if (music === null) {
      throw new ORPCError('NOT_FOUND', { message: '音乐不存在或已删除' })
    }
    return { music }
  })

const remove = authorProc
  .route({ method: 'POST', path: '/admin/music/remove' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    await deleteMusic(context.db, idFromString(input.id), {
      id: context.viewer.id,
      role: context.viewer.role,
    })
    recordAuditEventFromContext(context, {
      action: 'music_deleted',
      resourceType: 'music',
      resourceId: input.id,
    })
  })

export const adminMusicRouter = { list, search, add, get, update, delete: remove }
