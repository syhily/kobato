import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

/**
 * Custom validation messages: typed UI-catalog ids (the settings service maps
 * them into wire descriptors on write). `s3FieldRequired` carries `{label}`.
 */
export const assetsValidationMessages = {
  endpointHttps: 'admin.settings.assets.error.endpointHttps',
  urlTemplate: 'admin.settings.assets.error.urlTemplate',
  robotsPrintable: 'admin.settings.assets.error.robotsPrintable',
  bucketName: 'admin.settings.assets.error.bucketName',
  s3FieldRequired: 'admin.settings.assets.error.s3FieldRequired',
} as const satisfies Record<string, UiMessageId>

const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

// The asset host/scheme pair also feeds image public URLs and music metadata. Storage:
// S3 when `storage.enabled` and every bucket field is filled, local otherwise. Bucket
// fields stay nullable when disabled; `secretAccessKey` follows "optional ⇒ keep existing".

// Branding slots are managed via `/admin/branding/upload` + `/admin/branding/clear`, not
// this PATCH — but must be declared or Zod strips them on read.
const ROBOTS_PRINTABLE = /^[\t\n\r -~]*$/
const robotsTxt = z
  .string()
  .max(2_000)
  .refine((v) => v === '' || ROBOTS_PRINTABLE.test(v), {
    message: assetsValidationMessages.robotsPrintable,
  })

const brandingObjectRef = z.object({
  etag: z.string().min(1).max(128),
  contentType: z.string().min(1).max(128),
  size: z.number().int().min(0),
  updatedAt: z.string().min(1).max(64),
  // Defaults to 's3' for refs persisted before local storage existed.
  driver: z.enum(['s3', 'local']).default('s3'),
})

export const assetsSchema = z
  .object({
    asset: z.object({
      host: z
        .string()
        .trim()
        .min(1)
        .max(253)
        .regex(/^[a-z0-9.-]+$/i, assetsValidationMessages.bucketName),
      scheme: z.enum(['http', 'https']),
    }),
    storage: z.object({
      enabled: coerceBoolean,
      endpoint: z.union([z.literal(''), z.url()]),
      region: z.string().trim().max(60),
      bucket: z.string().trim().max(120),
      accessKeyId: z.string().trim().max(255),
      secretAccessKey: z.string().trim().max(512).optional(),
      forcePathStyle: coerceBoolean,
      urlTemplate: z.string().trim().max(500),
    }),
    upload: z.object({
      maxBytes: z.coerce
        .number()
        .int()
        .min(1024)
        .max(50 * 1024 * 1024),
      jpegQuality: z.coerce.number().int().min(40).max(100),
    }),
    branding: z
      .object({
        // The 5 SVG + 8 binary slots managed by `/admin/branding/upload` +
        // `/admin/branding/clear`; absent until uploaded. Names mirror `src/server/assets/defaults.ts`.
        faviconSvg: brandingObjectRef.optional(),
        logoSvg: brandingObjectRef.optional(),
        logoDarkSvg: brandingObjectRef.optional(),
        logoLargeSvg: brandingObjectRef.optional(),
        logoLargeDarkSvg: brandingObjectRef.optional(),
        faviconIco: brandingObjectRef.optional(),
        appleTouchIcon: brandingObjectRef.optional(),
        icon192: brandingObjectRef.optional(),
        icon512: brandingObjectRef.optional(),
        openGraph: brandingObjectRef.optional(),
        blogPoster: brandingObjectRef.optional(),
        blogPosterDark: brandingObjectRef.optional(),
        defaultAvatar: brandingObjectRef.optional(),
        defaultMusicCover: brandingObjectRef.optional(),
        robotsTxt: robotsTxt.optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.storage.enabled) {
      return
    }
    // When the toggle is on, every bucket field must carry a real value (catches a hand-crafted PATCH).
    const required: { key: keyof typeof value.storage; label: string }[] = [
      { key: 'endpoint', label: 'Endpoint' },
      { key: 'region', label: 'Region' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'accessKeyId', label: 'Access Key ID' },
    ]
    for (const { key, label } of required) {
      const fieldValue = value.storage[key]
      if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['storage', key as string],
          message: assetsValidationMessages.s3FieldRequired,
          params: { label },
        })
      }
    }
  })

// Install-form seed for the storage/upload buckets (the `asset` host/scheme pair
// comes from the request hostname); consumed by `services/install-flow.ts` only.
export const ASSETS_STORAGE_INSTALL_DEFAULTS = {
  storage: {
    enabled: false,
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    urlTemplate: '',
  },
  upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
} as const

// Write-path-only storage URL rules, shared with the migration-target input
// (`http/controllers/admin/storage.controller.ts`). They deliberately live
// OUTSIDE `assetsSchema`: hydrate shares that schema, and a stored `http://`
// endpoint from an existing install must keep hydrating — a failing row
// would silently fall back to section defaults and disable storage. New
// writes, however, must not persist a plaintext endpoint (credentials ride
// every request to it) or an open-redirect-capable CDN template.
/**
 * Write-path storage-URL rules' custom messages: typed UI-catalog ids. The
 * settings service maps them into wire descriptors (English fallback + path),
 * so a rejected save never shows a raw id.
 */
export const STORAGE_ENDPOINT_HTTPS_MESSAGE = assetsValidationMessages.endpointHttps
export const STORAGE_URL_TEMPLATE_MESSAGE = assetsValidationMessages.urlTemplate

export function isSafeStorageEndpoint(endpoint: string): boolean {
  return endpoint === '' || endpoint.toLowerCase().startsWith('https://')
}

/** The redirect boundary (`http/resources/storage-redirect.ts`) treats a
 *  template containing `{src}` as the FULL 302 target (must be an https
 *  URL) and anything else as a suffix appended to the object URL (must not
 *  carry a scheme or a protocol-relative `//` prefix — either would let the
 *  template bounce visitors to an arbitrary origin). */
export function isSafeStorageUrlTemplate(template: string): boolean {
  if (template === '') {
    return true
  }
  if (template.includes('{src}')) {
    return template.toLowerCase().startsWith('https://')
  }
  return !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(template)
}

export const assetsWriteSchema = assetsSchema.superRefine((value, ctx) => {
  if (!isSafeStorageEndpoint(value.storage.endpoint)) {
    ctx.addIssue({ code: 'custom', path: ['storage', 'endpoint'], message: STORAGE_ENDPOINT_HTTPS_MESSAGE })
  }
  if (!isSafeStorageUrlTemplate(value.storage.urlTemplate)) {
    ctx.addIssue({ code: 'custom', path: ['storage', 'urlTemplate'], message: STORAGE_URL_TEMPLATE_MESSAGE })
  }
})

export const assetsSection = {
  scope: 'blog.assets',
  key: 'assets',
  schema: assetsSchema,
  writeSchema: assetsWriteSchema,
  defaults: null,
} as const
