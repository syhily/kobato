import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { z } from 'zod'

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

export const STORAGE_ENDPOINT_HTTPS_MESSAGE = assetsValidationMessages.endpointHttps
export const STORAGE_URL_TEMPLATE_MESSAGE = assetsValidationMessages.urlTemplate

export function isSafeStorageEndpoint(endpoint: string): boolean {
  return endpoint === '' || endpoint.toLowerCase().startsWith('https://')
}

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
