import { z } from 'zod'

const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

// `<MusicPlayer>` to fetch APlayer audio + lyrics), the S3-compatible
// storage credentials, and the upload limits for the admin image
// library. Image public URLs share the same `asset.scheme://asset.host`
// base with music metadata, so combining the two keeps the operator
// from having to keep two pages in sync.
//
// Storage is always available: uploads go to the active backend, which
// is S3 when `storage.enabled` is on AND every bucket field is filled
// (the `superRefine` below enforces the latter), and the local
// filesystem otherwise (`$DATA_PATH/storage/`). There is no longer an
// "uploads refused with 503" state — local is the always-on fallback,
// so fresh installs work out of the box without configuring S3.
//
// Each asset row records the backend it was written to (`storageDriver`),
// so reads, deletes, and public-URL resolution dispatch correctly after
// a local→S3 switch, and the migration tool can copy local objects to S3.
//
// We deliberately keep the bucket fields nullable when disabled so
// that flipping the toggle off doesn't force the admin to re-paste
// the credentials when they flip it back on later. The admin form
// remembers (and re-submits) the previously-typed values.
//
// `secretAccessKey` follows the same "optional ⇒ keep existing"
// convention as `mail.apiKey`: the admin form sends `undefined` to
// signal "I'm tweaking other fields, don't make me re-paste the
// secret". `applySectionPatch` folds the persisted value back in;
// passing an empty string (or any explicit string) overwrites the
// stored secret.

// Branding user-asset slots (SVGs / binaries) are managed through the
// dedicated `/admin/branding/upload` and `/admin/branding/clear`
// endpoints. Only `robotsTxt` is plain text configuration written
// through this PATCH — the binary slots come back through the schema
// during hydration, so they have to be declared here or Zod would
// strip them on read and the uploaded ObjectRefs would silently
// disappear from the bundle.
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
        // `/admin/branding/upload` + `/admin/branding/clear`. Each
        // stores a `BrandingObjectRef` after upload; not present until
        // the admin uploads one. Slot names mirror
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
    // When the toggle is on, every bucket field has to carry a real
    // value. The admin form mirrors these checks client-side so the
    // user never reaches the network in the all-empty case, but a
    // hand-crafted PATCH would otherwise sneak through.
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
