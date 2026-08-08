import { z } from 'zod'

import { isoDateTime } from '@/shared/contracts/primitives'

/** The three browser web-font slots managed by `/admin/library/fonts`. */
export const fontSlot = z.enum(['global', 'post', 'code'])
export type FontSlot = z.infer<typeof fontSlot>

// The `font` table's PK is `uuid` (not the numeric `idString`), so the
// id is validated inline.
export const adminFontDto = z.object({
  id: z.uuid(),
  familyName: z.string(),
  sourceName: z.string(),
  hash: z.string(),
  cssKey: z.string(),
  storageDriver: z.enum(['s3', 'local']),
  chunkCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  etag: z.string(),
  createdAt: isoDateTime,
})
export type AdminFontDto = z.infer<typeof adminFontDto>

export const listFontsOutputDto = z.object({
  fonts: z.array(adminFontDto),
})
export type ListFontsOutput = z.infer<typeof listFontsOutputDto>

export const setFontSlotInputDto = z.object({
  slot: fontSlot,
  fontIds: z.array(z.uuid()).max(8),
})
export type SetFontSlotInput = z.infer<typeof setFontSlotInputDto>
