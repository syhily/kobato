import { adminImagesContract } from '@kobato/api/rpc/admin/images'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { userSession } from '@kobato/server/domains/auth/primitives'
import {
  deleteImage,
  recalculateImageThumbhash,
  updateImageNote,
} from '@kobato/server/domains/images/services/admin-mutate'
import { listImagesForAdmin } from '@kobato/server/domains/images/services/admin-read'
import { checkImageUpload, uploadImage } from '@kobato/server/domains/images/services/upload'
import { implementAuthor, localizedOrpcError, localizedOrpcErrorDescriptor } from '@kobato/server/http/orpc-base'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { idFromString } from '@kobato/utils/id'

const impl = implementAuthor(adminImagesContract)

const list = impl.list.handler(({ input, context }) =>
  listImagesForAdmin(context.db, {
    q: input.q,
    kind: input.kind,
    offset: input.offset,
    limit: input.limit,
  }),
)

const remove = impl.delete.handler(async ({ input, context }) => {
  await deleteImage(context.db, idFromString(input.id), context.viewer)
  recordAuditEventFromContext(context, {
    action: 'image_deleted',
    resourceType: 'image',
    resourceId: input.id,
  })
})

const updateNote = impl.updateNote.handler(async ({ input, context }) => {
  const image = await updateImageNote(context.db, idFromString(input.id), input.note ?? null, context.viewer)
  recordAuditEventFromContext(context, {
    action: 'image_note_updated',
    resourceType: 'image',
    resourceId: input.id,
  })
  return { image }
})

const recalculateThumbhash = impl.recalculateThumbhash.handler(async ({ input, context }) => {
  const image = await recalculateImageThumbhash(context.db, idFromString(input.id), context.viewer)
  return { image }
})

const upload = impl.upload.handler(async ({ input, context }) => {
  const settings = requireBlogSettingsSection('assets')
  const rejection = checkImageUpload(input.file, settings.upload.maxBytes)
  if (rejection !== null) {
    throw localizedOrpcErrorDescriptor(context, rejection.code, rejection.descriptor)
  }
  const sessionUser = userSession(context.session)
  if (!sessionUser) {
    throw localizedOrpcError(context, 'UNAUTHORIZED', 'error.api.unauthorized')
  }
  const uploader = { id: idFromString(sessionUser.id), name: sessionUser.name }
  const buffer = Buffer.from(await input.file.arrayBuffer())
  const { metadata } = input
  if (metadata.kind !== 'generic' && context.viewer.role !== 'admin') {
    throw localizedOrpcError(context, 'FORBIDDEN', 'images.error.adminOnlyKinds')
  }
  const baseArgs = {
    buffer,
    note: metadata.note ?? null,
    uploader,
    maxBytes: settings.upload.maxBytes,
    jpegQuality: settings.upload.jpegQuality,
  }
  let image
  if (metadata.kind === 'generic') {
    image = await uploadImage(context.db, { kind: { kind: 'generic' }, ...baseArgs })
  } else if (metadata.kind === 'category') {
    image = await uploadImage(context.db, { kind: { kind: 'category', slug: metadata.slug }, ...baseArgs })
  } else {
    image = await uploadImage(context.db, { kind: { kind: 'friend', host: metadata.host }, ...baseArgs })
  }
  recordAuditEventFromContext(context, {
    action: 'image_uploaded',
    resourceType: 'image',
    resourceId: image.id,
  })
  return { image }
})

export const adminImagesRouter = impl.router({
  list,
  delete: remove,
  updateNote,
  recalculateThumbhash,
  upload,
})
