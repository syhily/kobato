import { isoDateTime } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const fontSlot = z.enum(['global', 'post', 'code'])
export type FontSlot = z.infer<typeof fontSlot>

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

export const adminFontsListInput = z.object({}).optional()
export type AdminFontsListInput = z.infer<typeof adminFontsListInput>

export const adminFontDeleteInput = z.object({ fontId: z.uuid() })
export type AdminFontDeleteInput = z.infer<typeof adminFontDeleteInput>

export const adminFontDeleteOutputDto = z.object({ font: adminFontDto })
export type AdminFontDeleteOutput = z.infer<typeof adminFontDeleteOutputDto>

export const adminFontSetSlotOutputDto = z.object({}).optional()
export type AdminFontSetSlotOutput = z.infer<typeof adminFontSetSlotOutputDto>
