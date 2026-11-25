# Backup domain conventions

- A backup is a gzipped tar of exactly three payloads: `kobato.db`, `analytics.duckdb`, env-converged
  `kobato.config.json`; the disposable `<storage.data>/cache` tree is NOT included. A legacy named-column `access_log`
  sidecar is converted by the boot-time blob migration on first boot after restore.

## Encryption

- Optional password encryption (`backup.encryption`): enabling REQUIRES a stored password — the section schema rejects
  `enabled` without one and the create path fails closed. `resolveStoredEncryptionPassword()` (`services/backup.ts`) is
  the single reader. Encrypted archives carry the `.enc` suffix; that suffix — not a stream probe — is how `listBackups`
  / `isBackupEncrypted` / the download route know.
- The archive streams through chunked AES-256-GCM (`services/crypto.ts`); reordering, truncation, and forged lengths
  fail authentication. `BackupDecryptionError.kind` splits `'auth'` (retryable) from `'format'`.

## Restore

- Applies the three payloads IN ORDER: content DB → analytics sidecar (skipped on setup) → config. A successful
  completion wipes `<storage.data>/cache` before `restartServer()`; `success=false` rollbacks never wipe.
- The staged config is validated during staging AND again before the first swap against the checks the next boot applies
  — a config the next boot would reject aborts with 400 and no swap. A config write failure is warn-only and never rolls
  back completed engine swaps.
- Swap crash consistency: boot runs `recoverPreRestoreFiles()` BEFORE the engines open (mid-swap crash = rename the
  `.pre-restore` sibling back); before every restore `discardSwapLeftovers()` deletes leftovers STRICTLY — a failed
  delete aborts.
- Wrong passwords surface as `BackupPasswordError` (400), descriptor `backup.error.passwordWrong` — the client matches
  THAT key, never localized prose. The stored-backup controller catches `EncryptedBackupPasswordRequired` and answers
  `{passwordRequired: true}`.
- A backup row's `storage_path` rides inside the restored database: every stream/delete path re-checks it against the
  backup key grammar — the download refuses with 400, deletes drop the row and never touch the named object.

## Encrypted uploads

- `admin.backup.uploadRestore` (oRPC multipart) stages the raw bytes and answers `{encrypted, token}`; the UI then calls
  `admin.backup.uploadRestoreDecrypt`. The claim/stage/restore chain lives in `upload-restore.ts`; the perimeter injects
  the `afterReopen` hook that records the `backup_restored` audit — the domain never imports audit.
- `uploadRestoreDecrypt` rides its rate limiter on the implementer, so the budget burns BEFORE input parsing. Restores
  audit `backup_restored`; downloads audit `backup_downloaded`.
- The 30s global timeout exempts the restore endpoints (30-minute budget, declared through each procedure's
  `requestTimeoutMs`). Downloads use the CSRF-exempt GET `/rpc/admin/backup/download` and stream through
  `getBackupStream`, never the capped buffer read.
