# Storage domain conventions

S3 is configured on `/admin/settings` (存储配置 / assets section). First-time saves of `assets.storage.*` are
connectivity-probed (`validateS3Config`) before persisting.

- Write-path URL rules live OUTSIDE `assetsSchema` (hydration keeps reading legacy `http://` rows): `assetsWriteSchema`
  on the section's `writeSchema` slot requires `https://` and restricts `urlTemplate` to an https full URL carrying
  `{src}` or a scheme-less relative suffix.
- Once `storage.enabled` is true the config is LOCKED: `updateBlogSettingsSection` rejects `storage.*` patches unless
  `{ allowStorageConfigOverride: true }` (reserved for the migration task). ONE exemption: a patch changing only
  `accessKeyId` / `secretAccessKey` / `urlTemplate` is allowed while locked and still probed. Everything else requires a
  migration.
- Every backend switch runs through the migration task in `s3-migration.ts`: copy ALL objects (listing-driven,
  cursor-checkpointed) → flip config + driver columns → catch-up passes. Cancellable and resumable; a completed
  migration records source/target consistency verification. Admin procedures:
  `admin.storage.{migrationStatus,startMigration,cancelMigration,resumeMigration}`. Migration targets use
  `createS3BackendFromConfig`, never the settings-driven singleton.
- Key policy lives in ONE module, `packages/server/src/infra/storage/key-policy.ts`: extension → Content-Type,
  key-prefix → cache visibility (`backup/` / `branding/` / `audit-log/` are private), visibility → Cache-Control. The
  serving routes, the S3 adapter's write-time headers, and the migration all read from it.

## Asset URLs

- Asset URLs are site-owned: content stores origin-relative `/storage/<key>` references; `resolveAssetUrl`
  (`infra/storage/public-url.ts`) emits `${siteIdentity.website}/storage/<key>` for BOTH drivers — never the CDN base.
  Both directions share the path grammar owned by `shared/base/src/assets/asset-url.ts`.
- With S3 primary, the `storage.object` and `fonts.embedded` procedures answer the `redirect` envelope to
  `getPublicBaseUrl()` via `s3StorageRedirect` (`domains/storage/redirect.ts`; an unconfigured public base is the
  `'unavailable'` signal, which the controllers translate into `SERVICE_UNAVAILABLE`); the CDN transform template is
  applied AT THAT BOUNDARY — clients signal transform intent with `w`/`h`/`q` params on the site-owned URL and the
  redirect substitutes them. Local-driver reads go through `domains/storage/local-object.ts` (`lookupStoredLocalObject`
  → stat-backed etag `"size-mtime"`, `openStoredLocalObject` → byte-range stream) and the shared answer builder
  `http/media-resource.ts`.
- Boundaries that must be absolute (feeds, OG meta) absolutize srcs while computing `bodyHtmlFeed`
  (`absolutizeAssetSrcForFeed` in `@kobato/inkling/headless/cards/card-html.ts`). `asset-url-backfill.ts` rewrites
  legacy references once at boot and after each completed storage migration.
- `s3-migration.ts` is a Platform domain importing no Core/Feature domain: collaborators are injected through
  `wireS3Migration` at the composition root, and the settings lock probe flows the reverse way
  (`isStorageMigrationActive`).
