import { z } from 'zod'

export const publicMusicMetaDto = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  album: z.string(),
  url: z.string(),
  pic: z.string(),
  lyric: z.string(),
})
export type PublicMusicMeta = z.infer<typeof publicMusicMetaDto>

export const musicGetInputSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{16}$/, 'invalid player id'),
})
export type MusicGetInput = z.input<typeof musicGetInputSchema>

export const musicGetOutputSchema = z.object({ music: publicMusicMetaDto })
export type MusicGetOutput = z.infer<typeof musicGetOutputSchema>
