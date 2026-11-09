# ADR-0013: Filesystem sharded-directory cache replaces the `kv_cache` table

- Status: accepted
- Date: 2026-11-09

## Context

The persistent cache lives in the `kv_cache` SQLite table
(`src/server/infra/db/schema/kv-cache.ts`): the behavior plane
(`src/server/infra/cache/registry.ts`) reads/writes it through the row-access
layer (`src/server/infra/cache/kv-store.ts`), the admin panel counts it
(`src/server/infra/cache/buckets.ts`), and the hourly `kv-sweep` job deletes
expired rows (`src/server/infra/cache/kv-maintenance.ts`).

Two facts make that placement costly:

1. **Backups archive the table.** `createBackupUnchecked` snapshots the whole
   content DB via `VACUUM INTO`
   (`src/server/domains/backup/services/backup.ts`), so every live cache row
   rides into every archive. The heavy buckets are binary — OG cards, calendar
   PNGs (per day × theme), avatars — and PNGs are already compressed, so gzip
   shrinks them ~1:1. The archive is dominated by data that is disposable by
   contract.
2. **The workload is blob-shaped, not query-shaped.** Access is always
   point-lookup by exact key (single or MGET batch), whole-bucket delete, or
   expiry sweep. Nothing iterates, joins, or ranges over `kv_cache`. SQLite's
   strengths are unused; its costs (page bloat in the live DB, WAL churn on
   blob rewrites) are fully paid.

Hard constraints: single-process SEA distribution with no separate components
(Redis/Valkey/Memcached are out by decree); no new native dependencies;
`clear`/`bumpCounter` are called synchronously inside entity transactions
(`src/server/domains/content/invalidate.ts`; the comment-persist call sites in
`src/server/domains/comments/repos/mutate.ts` invoke it inside the transaction,
documented in that module), so the invalidation verbs must stay synchronous.

## Decision

**The persistent cache becomes a sharded directory of files under
`<storage.data>/cache/`, owned by a new file-access layer that replaces
`kv-store`.** The behavior plane's semantics are unchanged — key construction,
`BEHAVIORS`, inflight coalescing, `devBypass`, and the best-effort error
degradation in `readEntry`/`writeEntry` (a failed read is a miss, a failed
write is skipped warmth) all carry over verbatim, and the file store's
ENOENT/EPERM/EBUSY errors land in exactly those existing handlers. The verb
signatures, however, lose the `Database` parameter (see "What leaves SQLite").

This is a **storage-placement and lifecycle optimization** — smaller backups,
a permanently leaner content DB, a disposable cache — **not a read-latency
optimization**. The hot read path trades SQLite page-cache lookups for
per-key syscalls; that trade was measured by the POC in "Performance
posture" and accepted within its stated envelope.

### Cache dir placement: independent of the SEA natives cache

The cache lives at `<storage.data>/cache/` and deliberately does **not**
reuse the SEA natives cache dir (`resolveCacheDir()` in
`src/server/infra/sea.ts`: `KOBATO_CACHE_DIR` > `%LOCALAPPDATA%\kobato` >
`$XDG_CACHE_HOME/kobato` > `~/.cache/kobato`, holding `natives-<hash>/`,
see `src/server/infra/sea-natives.ts`). The two are different species:

- **Sharing would leak across instances.** The natives dir is
  content-addressed (manifest sha256), so every instance on a machine can
  share it safely. Cache keys carry no instance identity — two sites on one
  machine would read each other's `imageMeta`/`avatar`/`og` entries under a
  shared dir. Scoping the cache to `storage.data` scopes it to the instance
  by construction.
- **Lifecycles stay independent.** The SEA bootstrap GCs only `natives-*`
  siblings; our sweep/restore-wipe only walks `cache/`. Neither subsystem
  can ever delete the other's files, even if an operator points
  `KOBATO_CACHE_DIR` and `storage.data` at the same parent.
- **Backup and restore semantics follow the data dir.** The archive's
  explicit payload list excludes `cache/` with zero code change, and the
  restore wipe has one obvious, instance-local target.

### Storage shape

```
<storage.data>/cache/
  <bucketId>/            # one dir per CACHE_DECLARATIONS entry (stable id)
    <h[0:2]>/            # 256 shard dirs
      <h[2:]>            # one file per entry; h = sha256(prefix + behaviorKey)
    _generation          # decimal integer text; only counter buckets
    _tmp/                # in-flight writes; swept by age, never read as entries
```

- **Path segments are the bucket id, never the tunable prefix.** Prefixes are
  admin-renamable; ids are stable. A prefix rename changes full keys, so old
  entries orphan and expire by TTL — exactly today's semantics — while the
  directory namespace never shifts.
- **Keys are hashed, not encoded.** Avatar keys contain raw emails; sha256
  keeps PII out of filenames (directory listings, crash logs, OS-level
  tooling). 64-hex-char names keep paths short enough for Windows `MAX_PATH`.
- **One file = one entry, envelope-prefixed payload:**
  `[4B magic "KBC1"][8B big-endian expiresAtMs, 0 = never][payload]`. JSON
  entries store UTF-8 text, binary entries store the raw buffer (the avatar
  sentinel protocol is payload-level and unchanged). An unknown magic reads
  as a miss and evicts the file — the filesystem twin of today's
  stale-schema-evicts-row rule.
- **Writes are tmp-file + `rename`.** The tmp file lands in the bucket's
  `_tmp/` dir and is renamed into the shard dir — same bucket tree, same
  filesystem, so the rename is atomic and a torn payload is never visible.
  Tmp names carry pid + random suffix. A crash before the rename leaves an
  orphan in `_tmp/`; the hourly sweep unlinks `_tmp/` files whose mtime is
  older than one hour (an in-flight write is milliseconds old, so the margin
  is generous). `_`-prefixed names cannot collide with hex shard dirs, and
  `_tmp/` is excluded from entry walks. No `fsync` — a crash loses recent
  writes, which read as misses and regenerate; that is the correct durability
  contract for a cache.
- **Writes are fire-and-forget off the request path.** File writes are
  already async (`fs/promises` on the libuv thread pool — the event loop is
  never blocked); `through()`/`throughMany()` additionally stop awaiting
  `writeEntry` and return the loader's value immediately (`void writeEntry(...)`,
  safe because `writeEntry` swallows its own errors). The ~0.4 ms write cost
  measured by the POC therefore never lands on any request. No writer
  sidecar, worker, or second process is introduced for this — see "Why not
  the alternatives".
- **Write-path directory caching tolerates clears.** Any mkdir-once
  directory memo must expect the bucket dir to vanish under a concurrent
  clear (the POC hit exactly this ENOENT): either recreate-and-retry once on
  ENOENT, or let the existing best-effort write handler drop the write. Both
  are acceptable; silently assuming the dir survives is not.
- **Windows rename caveat.** Replacing a destination whose file a reader
  currently holds open fails with `EPERM` on Windows. The write path is
  already best-effort (`writeEntry` logs and continues without warmth), so
  the outcome is a skipped cache write and a regeneration on the next
  request — no new error handling is required, and this is recorded here so
  nobody "fixes" the missing retry.

### Expiry and invalidation model

The current design's crown jewel is that **correctness never depends on
deletion**: every derived entry's key embeds whatever generation governs it,
so stale entries become unreachable by construction and deletion is only
space reclamation. The file store preserves that invariant and maps each
mechanism 1:1:

0. **Where the TTL comes from.** Each bucket's declaration in
   `src/shared/cache/registry.ts` owns the default (og/calendar/avatar 24 h;
   imageMeta/searchResult 1 h; feed/sitemap/categories/tags 300 s; comments
   30 s; githubRelease/githubAvatar 15 min). Tunable buckets
   (og/calendar/avatar/imageMeta/searchResult) accept admin overrides in the
   cache settings panel, clamped to 1 h–30 d
   (`src/server/domains/settings/sections/cache.ts`). Per-value overrides
   (`ttlFor`) still win where declared — e.g. githubAvatar caches failures
   for 300 s while successes ride the full slot TTL. At write time the
   envelope stores the absolute deadline `Date.now() + ttlSeconds * 1000`
   (big-endian u64 ms; `0` = never), exactly the semantics of the old
   `expires_at` column.
1. **Lazy TTL on read.** The read path opens the file, checks the envelope's
   absolute `expiresAtMs` against `Date.now()`, and on expiry unlinks
   (best-effort) and returns a miss. Expiry is absolute wall-clock — the same
   clock assumption as the `expires_at` column; backward clock jumps extend
   effective TTL identically to today. The `0` never-expire encoding is kept
   for forward compatibility (the counter moves to its own file).
2. **Hourly sweep walks the tree.** `kv-sweep` keeps its schedule and its
   session/one-time-token legs (those stay in SQLite — they are auth state,
   not cache). Its cache leg now does three things: unlink expired entry
   files (12-byte header check), reap aged `_tmp/` orphans, and tolerate
   races — a bucket dir removed mid-walk by a concurrent clear yields
   ENOENT, which is skipped; a Windows unlink racing an open reader fd
   (`EBUSY`/`EPERM`) is skipped and caught by the next pass (readers hold
   fds for microseconds).
3. **Generation counters orphan, never scan.** The `searchResult` counter
   becomes `cache/searchResult/_generation` — plain decimal text, read once
   per process and memoized (as today), bumped via tmp+rename. `bumpCounter`
   stays synchronous. Old-generation files are unreachable by key
   construction and reclaimed by the TTL sweep; no scan happens at bump
   time.
4. **Representation revisions keep keying.** `feed`/`calendar`/`og`/
   `comments`/`sitemap` keys embed section-scoped representation revisions;
   a settings save lands on fresh keys. Reclamation is **rename-to-trash,
   then async reap**: `clearLocalizedOutputs` and the large-bucket clears
   synchronously `renameSync(bucketDir → bucketDir.trash-<unique>)` (O(1),
   microseconds) and hand the trash dir to an async `fs/promises.rm`. The
   synchronous contract of `invalidateContent` (inside entity transactions)
   is preserved — and its buckets (feed/tags/categories/sitemap/comments)
   hold only single-digit file counts, so plain synchronous unlinks are
   microseconds there. The POC falsified the earlier "recursive `rmSync` is
   the same order as a SQL DELETE" claim (190–580 ms vs 2.5–3.2 ms for 2000
   entries); rename-to-trash removes the stall without touching the
   synchronous semantics, and correctness never depended on the delete
   anyway.
5. **Per-key and admin clears.** `invalidateImageEnhanceCacheFor`
   (imageMeta) unlinks one path. The admin panel's per-bucket/all clear is
   an **async** `fs/promises.rm` — that path was always async and is not
   bound by the synchronous-transaction constraint, so a huge clear never
   blocks request serving. Removed-entry counts for the admin result DTO
   come from a counting walk before the remove — best-effort, races
   concurrent writers, acceptable for a UI statistic.

**Restore wipes the cache dir, before the server comes back.** A restored
content DB is a different instance's data: revision-keyed buckets re-key
automatically, but revision-free buckets (`avatar`, `imageMeta`,
`githubRelease`, `categories`/`tags`'s fixed key) could serve stale entries
minted against the pre-restore corpus. So `createRestoreCompletion` gains a
success-path step placed **after the successful reopen and before
`restartServer()`** — no request may be served against the pre-restore
cache. The step removes and recreates `cache/`. Its failure policy is
explicit: a failed wipe does **not** block the restart (availability wins;
the content DB swap is already done and must not be stranded), it retries
per-bucket, and a still-failing result logs a warning and surfaces an admin
notification naming the residual staleness window — the revision-free
buckets above may serve pre-restore entries until their TTLs expire (TTL
is the upper bound of the window; revision-keyed buckets self-heal
immediately). Rollback restores keep the dir untouched: it was coherent
with the rolled-back DB.

### Performance posture

Measured by `tmp/poc-cache-bench.mjs` (zero-dependency `node` script; the
SQLite side uses the production schema and pragma set, the FS side the
envelope/layout above; warm stores, random keys; two consistent runs on
macOS/APFS, p50/p99):

| Scenario                       | SQLite          | Filesystem      | Delta (p50)               |
| ------------------------------ | --------------- | --------------- | ------------------------- |
| Hot read og blob 128 KiB       | 80 µs / 119 µs  | 80 µs / 168 µs  | ≈ parity                  |
| Hot read feed json ~24 KB      | 20 µs / 44 µs   | 64 µs / 148 µs  | +44 µs                    |
| Hot read imageMeta json ~250 B | 6.3 µs / 17 µs  | 44 µs / 106 µs  | +38 µs                    |
| MGET imageMeta ×64             | 159 µs / 225 µs | 535 µs / 2.1 ms | +0.38 ms                  |
| MGET imageMeta ×256            | 644 µs / 863 µs | 1.9 ms / 5.3 ms | +1.2 ms                   |
| Write og blob 128 KiB          | 65–84 µs        | 460–550 µs      | +0.4 ms                   |
| Write small json               | 36 µs           | 390–480 µs      | +0.4 ms                   |
| Sync whole-bucket clear ×2000  | 2.5–3.2 ms      | 190–580 ms      | **2 orders of magnitude** |

Reading of the numbers:

- **Reads regress in absolute terms but fit the per-request budget.** A
  typical SSR request performs a handful of cache reads (≤ ~0.4 ms added);
  the heaviest realistic case — one `readManyMeta` batch of 256 on an
  image-heavy listing — adds ~1.2 ms (p99 ~4.4 ms). All within the
  single-digit-milliseconds-per-request acceptance line. Blob reads are
  I/O-bound and at parity, which was the design's central bet.
- **Writes cost ~0.4 ms more each but never land on requests** (cache-aside
  writes follow a far more expensive loader, and they are fire-and-forget
  per the Decision).
- **The clear result is why reclamation is rename-to-trash + async reap**
  (mechanism 4 above); synchronous recursive delete of large buckets is
  ruled out by measurement, not by taste.
- **MGET is the known soft spot.** The only `throughMany` caller is
  `readManyMeta` (`src/server/domains/images/services/cache.ts:44`), batch
  size = images on a page; the `Promise.all` fan-out is bounded by the libuv
  thread pool (default 4), so fd exhaustion is not a concern. If real-world
  profiles show this batch dominating listings, the recorded fallback is the
  separate-SQLite-file design, not a new debate.

Sweep and admin-stats walks are linear in live entries. Scale is bounded by
bucket semantics: og ≈ posts × settings generations within TTL, calendar is
a constant (days-in-TTL × 2 themes), avatar ≈ distinct commenters, imageMeta
≈ uploaded images. Thousands to low tens of thousands of files per bucket is
the design envelope; the hourly walk at that scale is seconds of background
work, and the admin panel is the natural place to notice growth.

### What leaves SQLite

- A drizzle migration drops `kv_cache` (and its indexes); the schema module
  is deleted. Existing warmth is discarded — a cache refills on demand, and
  the render-warmup seam already re-heats OG/calendar at boot. Legacy
  archives that still carry a `kv_cache` table restore fine: the
  post-restore migration simply drops it on first boot.
- The behavior plane's verbs stop taking a `Database`. `through`/`get`/`set`/
  `remove`/`clear`/`throughMany`/`bumpCounter` — and `invalidateContent` —
  talk to the file store directly; dozens of call sites shed a `getDb()`
  dependency they only had for cache access. This churn is deliberate
  (architectural correctness over minimal diff): threading a DB handle
  through a layer that no longer uses it would be a lie.
- The admin stats snapshot counts live files per bucket via the same header
  check the read path uses. On-disk bytes become a trivial `stat` sum —
  worth surfacing in the panel while we are there.
- Backup needs no code change: the archive lists its payloads explicitly
  (`kobato.db`, `analytics.duckdb`, config) and the cache dir is simply not
  among them. Archives shrink to pure content + analytics.
- Documentation moves with the code: the `cache/` paragraph in
  `src/server/AGENTS.md` and the archive description in
  `src/server/domains/backup/AGENTS.md` are updated in the same change.

### Why not the alternatives

- **A separate SQLite cache file** (move `kv_cache` to its own
  `kobato-cache.db`, keep every SQL semantic): the closest neighbor and the
  honest runner-up. It solves the backup problem with zero semantic loss —
  MGET stays one statement, stats stay COUNT, synchronous clears stay
  cheap — and none of the syscall regression above applies. We still reject
  it for this workload: it keeps a second SQL engine instance to operate
  (pragma set, WAL checkpoints, restore-target bookkeeping) for a pure
  point-lookup blob store; blob rewrites keep paying SQLite page/WAL write
  amplification, just in a different file; and "the cache is a directory you
  can inspect and `rm -rf`" is operationally stronger than "the cache is a
  second database you must not back up". **If production profiles contradict
  the POC's latency envelope, this alternative is the designated fallback** —
  the file-store seam keeps the swap cheap.
- **A writer/reader sidecar process or worker** (offload all file I/O behind
  IPC): rejected on measurement-based reasoning. File writes are already
  async and, per this ADR, fire-and-forget — there is no event-loop work to
  offload. Reads must stay on the request path, and an IPC round trip
  (serialize, copy, context-switch; 128 KiB blobs copied per read) costs the
  same order as the ~40 µs syscall overhead it would remove — a plausible
  net regression, plus a protocol, crash recovery, and SEA-packaging surface
  out of all proportion to a byte-store cache. Revisit only for multi-instance
  shared caches, CPU-heavy cache transforms, or a measured thread-pool
  saturation (try `UV_THREADPOOL_SIZE` first).
- **Strip-on-backup** (the stopgap): fixes only the archive; keeps live-DB
  bloat and doubles backup I/O. Superseded.
- **classic-level** (pure-JS LevelDB): a real KV store, but LSM compaction
  rewrites blob values (write amplification), SST files sprawl, and
  whole-bucket clear is not one `rm -rf`.
- **node-lmdb**: fastest embedded reads, but a new native dependency and
  `map_size` tuning for a workload whose cost is I/O, not index lookup.
- **Redis & friends**: excluded by constraint (no separate components).

## Consequences

- No new dependency of any kind — `node:fs`/`node:crypto` only, the most
  SEA-friendly outcome.
- Single-process assumption is unchanged and now structural: no cross-process
  locking exists on the cache dir. This matches the existing "only this
  process bumps" counter contract.
- Vitest's `:memory:` DBs get a per-process `mkdtempSync` cache dir (mirroring
  `resolveStoragePath`'s `:memory:` pass-through); no config-table growth —
  the cache path stays derived from `storage.data`, no new `kobato.config.json`
  key. `KOBATO_CACHE_DIR` remains the natives-only override and never moves
  the kv cache. If a deployment ever needs the cache on another volume,
  tmp+rename atomicity is within-bucket-tree and survives the move.
- The one-time migration trades a cold-start regeneration storm for
  permanently smaller content DBs (page cache, faster `VACUUM INTO`, faster
  backups forever).
- Envelope versioning is the only forward-compat seam: `KBC1` → `KBC2` reads
  as wholesale miss + evict, the same posture as today's schema-gated
  buckets.
- The POC numbers above are the accepted baseline; the script stays at
  `tmp/poc-cache-bench.mjs` for re-runs. A production profile outside the
  stated envelope reopens this ADR, with the separate-SQLite-file design as
  the pre-recorded fallback rather than a new debate.
- Synchronous work on the invalidation path is now bounded by construction:
  single-digit unlinks inside transactions, O(1) renames for large
  reclamations, async deletes everywhere else.
