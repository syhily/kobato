import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminFontDto, ListFontsOutput, FontSlot, SetFontSlotInput } from '@/shared/types/fonts'

import { isoDateTime } from '@/shared/contracts/primitives'

export const fontSlot = z.enum(['global', 'post', 'code'])

// The `id` is a uuid (not the numeric `idString` used by image/post ids —
// the `font` table's PK is `uuid`), so it is validated inline.
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

export const listFontsOutputDto = z.object({
  fonts: z.array(adminFontDto),
})

export const setFontSlotInputDto = z.object({
  slot: fontSlot,
  fontIds: z.array(z.uuid()).max(8),
})

// ─── parity assertions ─────────────────────────────────
type _adminFontDtoParity = Assert<Equals<z.infer<typeof adminFontDto>, AdminFontDto>>
type _listFontsParity = Assert<Equals<z.infer<typeof listFontsOutputDto>, ListFontsOutput>>
type _setFontSlotParity = Assert<Equals<z.infer<typeof setFontSlotInputDto>, SetFontSlotInput>>
type _fontSlotParity = Assert<Equals<z.infer<typeof fontSlot>, FontSlot>>
