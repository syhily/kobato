# Backup domain conventions

- Gzipped tar of exactly three payloads: `kobato.db`, `analytics.duckdb`, env-converged `kobato.config.json`; the
  disposable `<storage.data>/cache` tree is NOT included. A legacy named-column `access_log` sidecar is converted by the
  boot-time blob migration on first boot after restore.

## Encryption

- Optional password encryption (`backup.encryption`): enabling REQUIRES a stored password — the section schema rejects
  `enabled` without one and the create path fails closed; manual creates may override per run, min 8 chars. Passwords
  are TRIMMED on both create and restore. `resolveStoredEncryptionPassword()` in `services/backup.ts` is the single
  reader; `resetBackupEncryption` is the test seam.
- The archive streams through chunked AES-256-GCM (`services/crypto.ts`: scrypt-derived key, `KOBENC01` magic); each
  record is `[u32 ctLen][1B flags][12B IV][ct][16B tag]` with AAD = seq‖flags (reordering/truncation/forged-length fail
  authentication; a declared length over 4 MiB is rejected before any read); bit0 flags FINAL, exactly one per stream.
  `BackupDecryptionError.kind` splits `'auth'` (retryable) from `'format'`. Encrypted archives carry the `.enc` suffix —
  that suffix, not a stream probe, is how `listBackups` / `isBackupEncrypted` / the download route know.

## Restore

- Applies the three payloads IN ORDER: content DB → analytics sidecar (skipped on setup) → config. A successful
  completion wipes `<storage.data>/cache` after the reopen/migration and before `restartServer()`; a failed wipe warns
  and still restarts; `success=false` rollbacks never wipe. `wipeCacheForRestore` resets the generation memo in a
  `finally`.
- The staged config is validated during staging AND again before the first swap against the same checks the next boot
  applies (`parseRestorableConfigJson`: legacy-key migration + `''`-as-unset + strict schema PLUS the env-over-file
  merged parse — the file schema alone is all-optional, so a config missing a required secret would otherwise pass and
  `process.exit(1)` after the swap): a config the next boot would reject aborts with 400 and no swap. The config write
  failure stays warn-only — never rolls back completed engine swaps.
- Swap crash consistency: boot runs `recoverPreRestoreFiles()` BEFORE the engines open (target missing + `.pre-restore`
  present = mid-swap crash, rename the sibling back; target present = drop the stale sibling). Before every restore,
  `discardSwapLeftovers()` deletes leftovers STRICTLY — a failed delete aborts (a leftover could roll back to a ghost
  database).
- Wrong passwords surface as `BackupPasswordError` (400), descriptor `backup.error.passwordWrong` — the client matches
  THAT key, never localized prose. The stored-backup controller catches `EncryptedBackupPasswordRequired` and answers
  `{passwordRequired: true}`. Structural/decrypt failures answer `backup.error.archiveCorrupt` (crypto detail stays in
  the log). A backup row's `storage_path` rides inside the restored database — every stream/delete path re-checks it
  against the backup key grammar; the download refuses with 400, deletes drop the row and never touch the named object.

## Encrypted uploads

- `admin.backup.uploadRestore` (oRPC multipart procedure) stages the raw bytes, detects the magic, parks the temp dir in
  `pending-uploads.ts` (10-minute token, max 4 parked, LRU eviction never touches in-flight, all-busy → 429) and answers
  `{encrypted, token}`; the UI prompts and calls the sibling oRPC procedure `admin.backup.uploadRestoreDecrypt`
  (`/rpc/admin/backup/uploadRestoreDecrypt`; oc.route `/admin/backup/upload-restore/decrypt`) — the claim/stage/restore
  chain lives in `upload-restore.ts` (the perimeter injects the `afterReopen` hook that records the `backup_restored`
  audit — the domain never imports audit); the controller rides `rateLimitByIp('backupRestoreDecrypt', 30/hour)` on the
  implementer so the budget burns BEFORE input parsing, same as the old Hono middleware (per-token mutex → 409,
  unknown/expired token → 410, wrong password → 400 with the token kept; `createApiApp` caps the canonical path at 64
  KiB → 413 `error.api.payloadTooLarge`, with the cap declared by `requestBodyLimit` metadata, and passwords over 512
  chars are a 400). The setup flow's gate checks run BEFORE its rate limiter so anonymous requests never burn the 5/hour
  budget. The stored settings password is tried first for stored-backup restores. Restores audit `backup_restored`,
  downloads `backup_downloaded`.
- Progress: the browser uploads via XHR and polls from the start; byte progress merges with `restore-machine.ts` phases
  in `restore-progress.ts` behind the oRPC procedures `admin.backup.restoreProgress` (peek) and
  `admin.backup.restoreStatus` (consume-once job report). The global 30s timeout exempts the restore endpoints
  (`/rpc/admin/backup/uploadRestore*`, `/rpc/account/setup/restore`, and the canonical decrypt RPC path
  `/rpc/admin/backup/uploadRestoreDecrypt` — 30-minute budget, declared through each procedure's `requestTimeoutMs`
  metadata and derived by `http/request/rpc-timeout-overrides.ts`). Downloads use the CSRF-exempt GET
  `/rpc/admin/backup/download` and still stream through `getBackupStream`, never the capped buffer read.
