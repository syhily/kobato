# ADR-0008: Filesystem sharded-directory cache replaces the `kv_cache` table

- Status: accepted
- Date: 2026-11-09

## Context

The persistent cache lived in the `kv_cache` SQLite table and rode into every
backup: `createBackupUnchecked` snapshots the whole content DB via `VACUUM INTO`
(`src/server/domains/backup/services/backup.ts`), and the heavy buckets are
already-compressed binaries (OG cards, calendar PNGs, avatars). The workload is
blob-shaped — point lookup by exact key, whole-bucket delete, expiry sweep — so
SQLite's strengths went unused while its costs (page bloat, WAL churn on blob
rewrites) were fully paid.

Hard constraints: single-process SEA distribution with no separate components
(Redis/Valkey/Memcached out by decree); no new native dependencies;
`clear`/`bumpCounter` run synchronously inside entity transactions
(`src/server/domains/content/invalidate.ts`; the comment-persist call sites in
`src/server/domains/comments/repos/mutate.ts`), so invalidation stays synchronous.

## Decision

`src/server/infra/cache/file-store.ts` owns the on-disk plane, `memory-store.ts`
the process-local L1, `registry.ts` the behavior plane — the ONLY module that
reads or writes entries. Admin stats/clears live in `buckets.ts`/`admin-ops.ts`,
the hourly filesystem leg in `kv-maintenance.ts`, coalescing in `inflight.ts`.
Key construction, `BEHAVIORS`, inflight coalescing, `devBypass`, and best-effort
degradation (failed read = miss, failed write = skipped warmth) are unchanged;
file-store ENOENT/EPERM/EBUSY land in those handlers and loader errors propagate.
The verbs take no `Database`. The file plane is storage placement, not a latency
win — hot-read speed comes from L1.

### On-disk layout

```
<storage.data>/cache/
  <bucketId>/            # one dir per CACHE_DECLARATIONS entry (stable id)
    <h[0:2]>/            # 256 shard dirs
      <h[2:]>            # one file per entry; h = sha256(fullKey)
    _generation          # decimal integer text; counter buckets only
    _tmp/                # in-flight writes; swept by age, never read as entries
```

- **Path segments are the bucket id, never the tunable prefix.** Prefixes are
  admin-renamable; ids are stable, and an id must match
  `/^[A-Za-z0-9][A-Za-z0-9_-]*$/` because it becomes a path segment.
- **Keys are hashed, not encoded.** Avatar keys hold raw emails; sha256 keeps PII
  out of filenames (listings, crash logs, OS tooling), and 64 hex chars stay
  short enough for Windows `MAX_PATH`.
- **One file = one entry, envelope-prefixed:** `[4B magic "KBC1"][8B big-endian
  expiresAtMs, 0 = never][payload]`. JSON stores UTF-8 text, binary the raw
  buffer (the avatar sentinel is payload-level and unchanged). A short or
  unknown-magic envelope reads as a miss and evicts the file; `KBC1` → `KBC2`
  therefore means wholesale miss + evict — the only forward-compat seam.
- **Writes are tmp-file + `rename`, fire-and-forget.** The tmp file
  (`<pid>-<random>.tmp`) lands in `<bucket>/_tmp/` and is renamed into the shard
  dir — same tree, same filesystem, so a torn payload is never visible. No
  `fsync`: a crash loses recent warmth, which regenerates. `through()`/
  `throughMany()` return the loader's value without awaiting the write
  (`void writeEntry(...)`, safe because `writeEntry` swallows its own errors), so
  write cost never lands on a request; no writer sidecar or worker.
- **Directory races are absorbed best-effort.** A concurrent clear between
  `mkdir` and `rename` means recreating once and retrying on ENOENT (dropping the
  write is also acceptable; assuming the dir survives is not). A Windows `EPERM`
  from a reader holding the destination becomes a skipped write plus
  regeneration — do NOT add a retry.
- **The cache root is `<storage.data>/cache`, never the SEA natives dir**
  (`resolveCacheDir()` in `src/server/infra/sea.ts` resolves
  `KOBATO_CACHE_DIR` > `%LOCALAPPDATA%\kobato` > `$XDG_CACHE_HOME/kobato` >
  `~/.cache/kobato`, holding `natives-<hash>/`). That dir is content-addressed
  and safely shared; cache keys carry no instance identity, so sharing would let
  two sites on one machine read each other's `imageMeta`/`avatar`/`og` entries.
  The lifecycles are independent too: the SEA bootstrap GCs only `natives-*`
  siblings, the sweep/restore wipe only walks `cache/`. `KOBATO_CACHE_DIR` stays
  natives-only and no new config key is added (the path derives from
  `storage.data`); Vitest `:memory:` DBs get a per-process `mkdtempSync` dir.

### Expiry

- **TTL source.** Declarations in `src/shared/cache/registry.ts` own the defaults
  (og/calendar/avatar 24 h; imageMeta/searchResult 1 h; feed, sitemap, categories,
  tags 300 s; comments 30 s; githubRelease/githubAvatar 15 min). Tunable buckets
  (og/calendar/avatar/imageMeta/searchResult) accept admin overrides clamped to
  1 h–30 d (`src/server/domains/settings/sections/cache.ts`); per-value `ttlFor`
  wins where declared (githubAvatar caches failures for 300 s).
- **One deadline.** The write path computes `Date.now() + ttlSeconds * 1000` once
  and hands it to both the envelope and L1, so memory can never outlive disk.
- **Lazy TTL on read.** The read path compares `expiresAtMs` with `Date.now()`,
  unlinks expired files best-effort, and returns a miss. Expiry is absolute
  wall-clock (a backward clock jump extends effective TTL); `0` = never-expire is
  kept for forward compatibility.

### Invalidation and generation semantics

Correctness never depends on deletion: every derived entry's key embeds the
generation that governs it, so stale entries are unreachable by construction and
deletion is only space reclamation. Every invalidation verb drops L1
synchronously BEFORE touching the filesystem, so a failed or slow leg cannot keep
a stale value servable; synchronous work is bounded to single-digit unlinks
inside transactions and O(1) renames for large reclamations.

1. **Hourly sweep walks the tree.** `kv-sweep` keeps its schedule and its
   session/one-time-token legs (auth state, not cache, stays in SQLite). The
   filesystem leg unlinks expired entry files (12-byte header read), reaps `_tmp/`
   files older than one hour, and reclaims `<bucket>.trash-*` dirs older than one
   hour. Races are skipped (ENOENT on a removed bucket, `EBUSY`/`EPERM` on a
   Windows unlink racing an open fd); one bucket's failure logs and lets the rest
   finish.
2. **Generation counters orphan, never scan.** `searchResult` is the only counter
   bucket: `cache/searchResult/_generation`, plain decimal text, read once per
   process and memoized (a failed read falls back to 0 and is NOT memoized),
   bumped by sync tmp+rename. `bumpCounter` is synchronous and returns `null` on
   failure. Old-generation files are unreachable by key construction and
   reclaimed by the TTL sweep; nothing scans at bump time.
3. **Representation revisions keep keying.** `feed`/`calendar`/`og`/`comments`/
   `sitemap` keys embed section-scoped representation revisions, so a settings
   save lands on fresh keys. `clearLocalizedOutputs` only reclaims the orphaned
   storage: each bucket is `renameSync`ed to `<bucket>.trash-<pid>-<random>`
   (O(1), mtime stamped so the sweep measures the trash) and handed to an async
   `fs/promises.rm` whose rejection is swallowed. Recursive `rmSync` of a large
   bucket is ruled out — two orders of magnitude costlier than a SQL DELETE
   (190–580 ms vs 2.5–3.2 ms for 2000 entries).
4. **Small-bucket clears stay synchronous.** Ordinary content invalidation
   (`invalidateContent`, inside entity transactions) covers
   feed/tags/categories/sitemap/comments, whose single-digit file counts make
   synchronous unlinks microseconds (`unlinkBucketEntriesSync`);
   `invalidateImageEnhanceCacheFor` (imageMeta) unlinks one path.
5. **Admin clears are async; counter buckets bump first.** L1 is evicted first. A
   counter bucket then strictly advances `_generation` (a failed bump aborts the
   clear) and drops entry shards plus `_tmp/` while keeping `_generation`, so a
   late writer under the old generation recreates an unreachable shard.
   Non-counter buckets `rm` the whole directory. Removed counts come from a
   counting walk before the remove (expired and malformed included) —
   best-effort, acceptable for a UI statistic.
6. **Restore wipes the cache before the server returns.** A restored DB is
   different data: revision-keyed buckets re-key themselves, but revision-free
   buckets (`avatar`, `imageMeta`, `githubRelease`, `categories`/`tags`'s fixed
   key) could serve entries minted against the pre-restore corpus.
   `createRestoreCompletion` runs a success-path step after the reopen (and
   post-restore migrate/ANALYZE) and before `restartServer()`:
   `wipeCacheForRestore` drops L1, removes and recreates `cache/`, and resets the
   generation memo in a `finally`. A failed whole-root wipe falls back to
   per-bucket `rm` and throws an `AggregateError`; it does not block the restart
   (availability wins; the DB swap is done), logs a warning, and notifies admins
   of the residual staleness window. Rollback restores keep the dir untouched.

### Process-local L1 memory tier and performance envelope

- **Shape.** One LRU per bucket bounded on BOTH entry count and estimated bytes
  (sum < ~12 MiB); an entry above 64 KiB is never admitted, and `og`/`calendar`
  carry a ZERO budget — L1-exempt by policy, independent of value size. Entries
  hold DECODED values plus the envelope's absolute `expiresAtMs`; a hit hands
  every caller the same object, so cache results are read-only by contract.
- **Writes mirror what a read would return.** Binary buckets mirror
  `decode(encode(value))`, JSON buckets the `JSON.parse(JSON.stringify(value))`
  round-trip sized by the exact stored text, so a memory hit is observationally
  identical to a disk hit. L1 fills only after the disk write succeeds; a
  disk-hit backfill reuses the envelope's deadline.
- **Process-local is sound** because the deployment is a single process — no
  cross-process coherence protocol exists or is needed. L1 hits still count as
  `cache.lookup` hits (bucket/result/coalesced labels only — never keys/params).

Measured envelope: file reads cost tens of µs more per key, `imageMeta` MGET ×256
+1.2 ms, writes off the request path. MGET's only `throughMany` caller is
`readManyMeta` (`src/server/domains/images/services/cache.ts`), fan-out bounded
by the libuv thread pool (default 4); scale is bounded by bucket semantics to
thousands–low tens of thousands of files per bucket.

**Rejected alternatives.** A separate SQLite cache file (`kobato-cache.db`) has
zero semantic loss and cheap MGET/clears, but keeps a second SQL engine (pragma
set, WAL checkpoints, restore bookkeeping) for a point-lookup blob store, still
pays page/WAL write amplification, and a directory you can `rm -rf` beats a
second database you must not back up — **it is the designated fallback if
production profiles contradict the envelope above**, and the file-store seam
keeps that swap cheap. A writer/reader sidecar loses: writes are already async
and fire-and-forget, and IPC costs the same order as the syscall overhead it
removes (revisit only for multi-instance shared caches or measured thread-pool
saturation — try `UV_THREADPOOL_SIZE` first). Strip-on-backup fixed only the
archive (superseded); `classic-level` rewrites blobs in LSM compaction;
`node-lmdb` adds a native dependency for an I/O-bound workload; Redis and friends
are excluded by constraint.

## Consequences

- No new dependency of any kind — `node:fs`/`node:crypto` only. The
  single-process assumption is structural: no cross-process locking exists on the
  cache dir, so a second writer process would need an invalidation protocol.
- A drizzle migration drops `kv_cache` and its indexes; the schema module is
  gone. Existing warmth is discarded — the cache refills on demand and
  render-warmup re-heats OG/calendar at boot. Legacy archives that still carry
  `kv_cache` restore fine: the post-restore migration drops it on first boot. The
  one-time migration trades a cold-start regeneration storm for permanently
  smaller content DBs (page cache, faster `VACUUM INTO`, faster backups).
- Admin stats count live files per bucket in one shard walk: `keyCount` counts
  valid unexpired `KBC1` entries, `byteSize` sums every entry file (expired and
  malformed included). Backup needs no code change: the archive lists its
  payloads explicitly (`kobato.db`, `analytics.duckdb`, config) and `cache/` is
  not among them. Contract pinned by `src/server/AGENTS.md` (the `cache/`
  paragraph) and `tests/unit/server/infra/cache/*`.
