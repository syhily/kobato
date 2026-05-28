import { z } from 'zod'

const sectionPayload = z.unknown().nullable()

export const blogSettingsBundleDto = z.object({
  siteIdentity: sectionPayload,
  assets: sectionPayload,
  navigation: sectionPayload,
  socials: sectionPayload,
  content: sectionPayload,
  sidebar: sectionPayload,
  comments: sectionPayload,
  seo: sectionPayload,
  mail: sectionPayload,
  cache: sectionPayload,
  rateLimit: sectionPayload,
  search: sectionPayload,
  fonts: sectionPayload,
  backup: sectionPayload,
  limits: sectionPayload,
  analytics: sectionPayload,
})

// Intentionally omitted — blogSettingsBundleDto uses z.unknown().nullable()
// per section until per-section schemas migrate to shared. See _dtos.ts
// header comment for rationale.
