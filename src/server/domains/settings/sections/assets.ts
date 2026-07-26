import { z } from 'zod'

const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

// Asset host/scheme base (shared by image public URLs and music
// metadata), the S3-compatible storage credentials, and the upload
// limits for the admin image library.
//
// Storage is always available: uploads go to S3 when `storage.enabled`
// is on AND every bucket field is filled (the `superRefine` below
// enforces the latter), and to the local filesystem otherwise. Each
// asset row records its backend (`storageDriver`) so reads, deletes,
// and public-URL resolution dispatch correctly after a local→S3 switch.
//
// The bucket fields stay nullable when disabled so toggling S3 off and
// back on doesn't force re-pasting credentials. `secretAccessKey`
// follows the same "optional ⇒ keep existing" convention as
// `mail.apiKey`: `undefined` keeps the stored secret, any string
// (including empty) overwrites it (`applySectionPatch` folds the
// persisted value back in).

// Branding binary slots are managed through `/admin/branding/upload` +
// `/admin/branding/clear`, not this PATCH — but they must be declared
// in the schema or Zod would strip them on read and the uploaded
// ObjectRefs would silently disappear from the bundle.
const ROBOTS_PRINTABLE = /^[\t\n\r -~]*$/
const robotsTxt = z
  .string()
  .max(2_000)
  .refine((v) => v === '' || ROBOTS_PRINTABLE.test(v), {
    message: 'robots.txt 只能包含可打印 ASCII 字符',
  })

const brandingObjectRef = z.object({
  etag: z.string().min(1).max(128),
  contentType: z.string().min(1).max(128),
  size: z.number().int().min(0),
  updatedAt: z.string().min(1).max(64),
  // Backend the bytes live in. Defaults to 's3' for refs persisted before
  // local storage existed, so historical branding assets resolve correctly.
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
        .regex(/^[a-z0-9.-]+$/i, '只能包含字母 / 数字 / `-` / `.`'),
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
        // The 5 SVG + 8 binary slots managed by
        // `/admin/branding/upload` + `/admin/branding/clear`; absent
        // until the admin uploads one. Slot names mirror
        // `src/server/assets/defaults.ts`.
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
    // When the toggle is on, every bucket field must carry a real value
    // (the admin form mirrors these checks client-side; this catches a
    // hand-crafted PATCH).
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
          message: `开启 S3 上传时「${label}」必填`,
        })
      }
    }
  })

// Install-form seed for the storage/upload buckets (the `asset`
// host/scheme pair comes from the request hostname). Consumed by
// `services/install-flow.ts` only; like `general`, the section ships no
// registry seed because the setup-time first write arrives complete.
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

export const assetsSection = {
  scope: 'blog.assets',
  key: 'assets',
  schema: assetsSchema,
  defaults: null,
} as const
