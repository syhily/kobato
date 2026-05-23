import { z } from 'zod'

const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

// Merged "存储配置" section: the music CDN host (consumed by
// `<MusicPlayer>` to fetch APlayer audio + lyrics), the S3-compatible
// storage credentials, and the upload limits for the admin image
// library. Image public URLs share the same `asset.scheme://asset.host`
// base with music metadata, so combining the two keeps the operator
// from having to keep two pages in sync.
//
// Image upload is gated by a single `storage.enabled` toggle:
//
//   - `enabled === false` (default for fresh installs) — uploads are
//     refused at the perimeter with a friendly 503. The admin library
//     UI still lists previously-uploaded rows and the public render
//     pipeline still resolves their public URL using the stored
//     `publicBaseUrl`, so historical S3 rows keep working even after
//     the toggle is flipped off.
//   - `enabled === true` — every field below is required (the schema
//     `superRefine` below enforces it). The runtime upload service
//     hands the buffer to the S3 client.
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
