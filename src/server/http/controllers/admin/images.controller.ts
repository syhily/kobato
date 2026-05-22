import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { userSession } from '@/server/domains/auth/primitives'
import { uploadImageMetadataSchema } from '@/server/domains/images/schema'
import {
  deleteImage,
  listImagesForAdmin,
  recalculateImageThumbhash,
  updateImageNote,
  uploadImage,
} from '@/server/domains/images/service'
import { authorProc } from '@/server/http/orpc-base'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { adminImageDto, listImagesOutputDto } from '@/shared/contracts/images'
import { idFromString } from '@/shared/utils/id'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}

const list = authorProc
  .route({ method: 'GET', path: '/admin/images/list' })
  .input(
    z.object({
      q: z.string().optional(),
      kind: z.enum(['generic', 'category', 'friend', 'all']).optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
  )
  .output(listImagesOutputDto)
  .handler(({ input }) =>
    listImagesForAdmin({
      q: input.q,
      kind: input.kind,
      offset: input.offset,
      limit: input.limit,
    }),
  )

const remove = authorProc
  .route({ method: 'POST', path: '/admin/images/remove' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    await deleteImage(idFromString(input.id), context.viewer)
    recordAuditEventFromContext(context, {
      action: 'image_deleted',
      resourceType: 'image',
      resourceId: input.id,
    })
  })

const updateNote = authorProc
  .route({ method: 'POST', path: '/admin/images/update-note' })
  .input(z.object({ id: z.string().min(1), note: z.string().nullable().optional() }))
  .output(z.object({ image: adminImageDto }))
  .handler(async ({ input, context }) => {
    const image = await updateImageNote(idFromString(input.id), input.note ?? null, context.viewer)
    recordAuditEventFromContext(context, {
      action: 'image_note_updated',
      resourceType: 'image',
      resourceId: input.id,
    })
    return { image }
  })

const recalculateThumbhash = authorProc
  .route({ method: 'POST', path: '/admin/images/recalculate-thumbhash' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ image: adminImageDto }))
  .handler(async ({ input, context }) => {
    const image = await recalculateImageThumbhash(idFromString(input.id), context.viewer)
    return { image }
  })

// oRPC RPC protocol supports `Blob` inputs natively (the standard
// serializer emits a `multipart/form-data` envelope when a Blob is
// present anywhere in the input tree). Clients pass the `File` from
// the upload dialog as `file`; oRPC client + handler do the rest.
const upload = authorProc
  .route({ method: 'POST', path: '/admin/images/upload' })
  .input(
    z.object({
      file: z.instanceof(Blob),
      metadata: uploadImageMetadataSchema,
    }),
  )
  .output(z.object({ image: adminImageDto }))
  .handler(async ({ input, context }) => {
    const settings = requireBlogSettingsSection('assets')
    if (input.file.size > settings.upload.maxBytes) {
      throw new ORPCError('PAYLOAD_TOO_LARGE', {
        message: `图片体积超过上限（${formatBytes(settings.upload.maxBytes)}）`,
      })
    }
    const sessionUser = userSession(context.session)
    if (!sessionUser) {
      throw new ORPCError('UNAUTHORIZED', { message: '未登录' })
    }
    const uploader = { id: idFromString(sessionUser.id), name: sessionUser.name }
    const buffer = Buffer.from(await input.file.arrayBuffer())
    const { metadata } = input
    const baseArgs = {
      buffer,
      note: metadata.note ?? null,
      uploader,
      maxBytes: settings.upload.maxBytes,
      jpegQuality: settings.upload.jpegQuality,
    }
    let image
    if (metadata.kind === 'generic') {
      image = await uploadImage({ kind: { kind: 'generic' }, ...baseArgs })
    } else if (metadata.kind === 'category') {
      image = await uploadImage({ kind: { kind: 'category', slug: metadata.slug }, ...baseArgs })
    } else {
      image = await uploadImage({ kind: { kind: 'friend', host: metadata.host }, ...baseArgs })
    }
    recordAuditEventFromContext(context, {
      action: 'image_uploaded',
      resourceType: 'image',
      resourceId: String(image.id),
    })
    return { image }
  })

export const adminImagesRouter = {
  list,
  delete: remove,
  updateNote,
  recalculateThumbhash,
  upload,
}
