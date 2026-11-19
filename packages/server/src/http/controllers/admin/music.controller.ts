import { adminMusicContract } from '@kobato/api/admin/music.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { findMusicDtoById, listMusicForAdmin } from '@kobato/server/domains/music/services/read.ts'
import { searchMusic } from '@kobato/server/domains/music/services/search.ts'
import { addMusic } from '@kobato/server/domains/music/services/write/add.ts'
import { deleteMusic } from '@kobato/server/domains/music/services/write/delete.ts'
import { updateMusicMetadata } from '@kobato/server/domains/music/services/write/metadata.ts'
import { implementAuthor, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { idFromString } from '@kobato/utils/id.ts'

const impl = implementAuthor(adminMusicContract)

const list = impl.list.handler(({ input, context }) =>
  listMusicForAdmin(context.db, {
    q: input.q,
    offset: input.offset,
    limit: input.limit,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
  }),
)

const search = impl.search.handler(({ input, context: _context }) =>
  searchMusic(input.source ?? 'netease', input.keyword, input.limit, input.offset),
)

const add = impl.add.handler(async ({ input, context }) => {
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
    resourceId: music.id,
  })
  return { music }
})

const update = impl.update.handler(async ({ input, context }) => {
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

const get = impl.get.handler(async ({ input, context }) => {
  const music = await findMusicDtoById(context.db, idFromString(input.id))
  if (music === null) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'music.error.notFoundOrDeleted')
  }
  return { music }
})

const remove = impl.delete.handler(async ({ input, context }) => {
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

export const adminMusicRouter = impl.router({ list, search, add, get, update, delete: remove })
