import { z } from 'zod'

// Admin GeoIP wire — the single Zod source the `@kobato/api` geoip contract
// composes and the server validates against.

export const adminGeoipStatusInput = z.object({})
export type AdminGeoipStatusInput = z.infer<typeof adminGeoipStatusInput>

export const adminGeoipStatusOutputDto = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  source: z.enum(['upload', 'remote']).nullable(),
  updatedAt: z.string().nullable(),
})
export type AdminGeoipStatusOutput = z.infer<typeof adminGeoipStatusOutputDto>

export const adminGeoipUpdateInput = z.object({})
export type AdminGeoipUpdateInput = z.infer<typeof adminGeoipUpdateInput>

export const adminGeoipUpdateOutputDto = z.object({
  status: z.enum(['updated', 'up-to-date']),
  version: z.string(),
  previousVersion: z.string().nullable(),
})
export type AdminGeoipUpdateOutput = z.infer<typeof adminGeoipUpdateOutputDto>
