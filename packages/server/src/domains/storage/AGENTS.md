# Storage domain conventions

S3 is configured on `/admin/settings` (存储配置 / assets section). First-time saves of `assets.storage.*` are
connectivity-probed (`validateS3Config`) before persisting.

- Write-path URL rules live OUTSIDE `assetsSchema` (hydration keeps reading legacy `http://` rows): `assetsWriteSchema`
  on the section's `writeSchema` slot requires `https://` and restricts `urlTemplate` to an https full URL carrying
  `{src}` or a scheme-less relative suffix; the migration-target input shares the predicates (`isSafeStorageEndpoint` /
  `isSafeStorageUrlTemplate`).
- Once `storage.enabled` is true the config is LOCKED: `updateBlogSettingsSection` rejects `storage.*` patches unless
  `{ allowStorageConfigOverride: true }` (reserved for the migration task). ONE exemption: a patch changing only
  `accessKeyId` / `secretAccessKey` / `urlTemplate` is allowed while locked and still probed. Everything else requires a
  migration.
- Every backend switch runs through the migration task in `s3-migration.ts`: copy ALL objects (listing-driven,
  cursor-checkpointed in the `storage_migration` singleton row) → flip config + driver columns → catch-up passes.
  Cancellable and resumable; a completed migration records source/target consistency verification (counts + bytes).
  Admin procedures: `admin.storage.{migrationStatus,startMigration,cancelMigration,resumeMigration}`. Migration targets
  use `createS3BackendFromConfig`, never the settings-driven singleton.
- Key policy lives in ONE module, `packages/server/src/infra/storage/key-policy.ts`: extension → Content-Type,
  key-prefix → cache visibility (`backup/` / `branding/` / `audit-log/` are private), visibility → Cache-Control. The
  serving routes, the S3 adapter's write-time headers, and the migration all read from it. Migration copies propagate
  stored headers verbatim; only a header-less source falls back to the key-policy defaults.

## Asset URLs

- Asset URLs are site-owned: content stores origin-relative `/storage/<key>` references; `resolveAssetUrl`
  (`infra/storage/public-url.ts`) emits `${siteIdentity.website}/storage/<key>` for BOTH drivers — never the CDN base.
  Both directions share the path grammar owned by `packages/shared/assets/src/asset-url.ts`.
- With S3 primary, `/storage/*` and `/fonts/embedded/*` 302 (Cache-Control `public, max-age=300`, query preserved) to
  `getPublicBaseUrl()` via `s3StorageRedirect`; the CDN transform template is applied AT THAT BOUNDARY — clients signal
  transform intent with `w`/`h`/`q` params on the site-owned URL and the redirect substitutes them; without a template
  the params are ignored.
- Boundaries that must be absolute (feeds, OG meta) absolutize srcs while computing `bodyHtmlFeed`
  (`absolutizeAssetSrcForFeed` in `@kobato/inkling/headless/cards/card-html.ts`). `asset-url-backfill.ts` rewrites
  legacy references to `/storage/<key>` once at boot (flag `system.asset-url-backfill`) and after each completed storage
  migration.
- `s3-migration.ts` is a Platform domain importing no Core/Feature domain: collaborators are injected through
  `wireS3Migration` at the composition root, and the settings lock probe flows the reverse way
  (`isStorageMigrationActive`).
