import { z } from 'zod'

const pixelDimension = z.number().int().min(0).max(32768).optional()

const deviceEnvStaticFields = {
  screenW: pixelDimension,
  screenH: pixelDimension,
  availW: pixelDimension,
  availH: pixelDimension,
  colorDepth: z.number().int().min(0).max(64).optional(),
  touchPoints: z.number().int().min(0).max(64).optional(),
  pointer: z.enum(['coarse', 'fine']).optional(),
  hover: z.enum(['hover', 'none']).optional(),
  locale: z.string().max(64).optional(),
  timezone: z.string().max(64).optional(),
  hardwareConcurrency: z.number().int().min(0).max(1024).optional(),
  deviceMemory: z.number().min(0).max(1024).optional(),
}

const deviceEnvDynamicFields = {
  viewportW: pixelDimension,
  viewportH: pixelDimension,
  dpr: z.number().min(0).max(10).optional(),
  colorScheme: z.enum(['dark', 'light']).optional(),
  reducedMotion: z.boolean().optional(),
  netEffectiveType: z.enum(['slow-2g', '2g', '3g', '4g']).optional(),
  netDownlink: z.number().min(0).max(10000).optional(),
  netRtt: z.number().int().min(0).max(60000).optional(),
  netSaveData: z.boolean().optional(),
}

export const deviceEnvBeaconSchema = z.object({
  eventId: z.uuid(),
  hasStatic: z.boolean(),
  ...deviceEnvStaticFields,
  ...deviceEnvDynamicFields,
})

export type DeviceEnvBeacon = z.infer<typeof deviceEnvBeaconSchema>

export const deviceEnvBeaconOutputSchema = z.object({ accepted: z.literal(true) }).strict()
export type DeviceEnvBeaconOutput = z.infer<typeof deviceEnvBeaconOutputSchema>
