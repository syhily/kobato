# Deployment

Every release ships TWO self-contained single executables — no Node.js runtime, no `node_modules`, no database server.
`kobato` is the backend: the admin workspace, the oRPC transport, the database, and the native packages (sharp, canvas,
DuckDB extract to a cache directory on first run). `sayaka` is the public site: the server-rendered public frontend that
talks to kobato over oRPC and forwards `/rpc/*`, `/admin/*`, and `/editor/*` to it — **it is the only listener a browser
needs**. The server bundles, client assets, and database migrations are embedded in each binary.

Targets: `linux-x64`, `linux-arm64` (glibc), `darwin-arm64`, `win32-x64`, and `win32-arm64`.

## Install from a release

Download the archives for your platform (e.g. `kobato-linux-x64.tar.gz` and `sayaka-linux-x64.tar.gz`) with their
`.sha256` sidecars from the [latest release](https://github.com/syhily/kobato/releases/latest), verify, extract, and
install:

```bash
sha256sum -c kobato-linux-x64.tar.gz.sha256
sha256sum -c sayaka-linux-x64.tar.gz.sha256
tar -xzf kobato-linux-x64.tar.gz
tar -xzf sayaka-linux-x64.tar.gz
install -m 0755 kobato-linux-x64 /usr/local/bin/kobato
install -m 0755 sayaka-linux-x64 /usr/local/bin/sayaka
kobato --version          # prints the baked-in version
sayaka --version
```

## Topology

Browsers talk to **sayaka only**: it serves every public document, feed, sitemap, image, and storage object, and proxies
the workspace (`/admin/*`, `/editor/*`) and the oRPC transport (`/rpc/*`) to kobato. kobato can therefore sit on a
private address or loopback interface — nothing else needs to reach it. Configure sayaka with
`SAYAKA_KOBATO_RPC_URL=http://<kobato-host>:<port>/rpc`, and keep kobato's `server.host` off the public internet.

kobato must honor the visitor address sayaka forwards. sayaka derives it from the peer address and re-derives
`X-Forwarded-For` itself, so when the two run on the SAME host (the default loopback topology) kobato's loopback peer is
trusted automatically. When sayaka runs on a DIFFERENT host, add sayaka's host to kobato's `security.trustedProxies` —
otherwise kobato keys every per-IP rate limit on sayaka's address instead of the visitor's.

## sayaka environment variables

| Variable                 | Meaning                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `SAYAKA_HOST`            | Listen host (default `0.0.0.0`)                                            |
| `SAYAKA_PORT`            | Listen port (default `4322`)                                               |
| `SAYAKA_KOBATO_RPC_URL`  | kobato's oRPC origin, e.g. `http://127.0.0.1:4321/rpc` (required)          |
| `SAYAKA_TRUSTED_PROXIES` | Comma-separated proxies in front of sayaka (same CIDR grammar as kobato's) |

## First boot

On first boot the kobato binary creates `kobato.config.json` next to itself with defaults (see
[Configuration](Configuration.md)). `storage.data` defaults to `./data` relative to the working directory — set it
explicitly for a system install, either by editing the file or by passing `__`-style environment variables once and
letting them be written into the file:

```ini
Environment=storage__data=/var/lib/kobato
```

Database migrations run automatically at the kobato boot. The native libraries extract into the cache directory on first
run — `$XDG_CACHE_HOME/kobato` (or `~/.cache/kobato`) on Linux/macOS, `%LOCALAPPDATA%\kobato` on Windows, overridable
with `KOBATO_CACHE_DIR`.

Once kobato is up, open `/admin/setup` through sayaka and enter the setup token printed in the console (it stays valid
until the first admin is created) to create the admin account. Settings are seeded automatically.

## Running as a service

Two minimal systemd units — sayaka is the public listener, kobato the backend:

```ini
[Unit]
Description=Kobato blog CMS (backend)
After=network-online.target

[Service]
Type=simple
# Generate real secrets with e.g. `openssl rand -hex 32` — the schema
# requires both ≥ 32 chars and encryptionKey ≥ 10 distinct characters.
Environment=security__sessionSecret=change-me
Environment=security__encryptionKey=change-me
Environment=storage__data=/var/lib/kobato
ExecStart=/usr/local/bin/kobato
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```ini
[Unit]
Description=Kobato public site (sayaka)
After=network-online.target

[Service]
Type=simple
Environment=SAYAKA_HOST=127.0.0.1
Environment=SAYAKA_PORT=4322
Environment=SAYAKA_KOBATO_RPC_URL=http://127.0.0.1:4321/rpc
ExecStart=/usr/local/bin/sayaka
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

On Windows there is no SIGTERM — shutdown relies on Ctrl+C signals, so wrap both binaries with a service wrapper such as
WinSW or NSSM (stop = send Ctrl+C).

## Command-line reference

| Command                               | Effect                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `kobato`                              | Start the backend server                                                                                   |
| `sayaka`                              | Start the public-site server                                                                               |
| `kobato --version`, `-v`              | Print the version and exit                                                                                 |
| `sayaka --version`, `-v`              | Print the version and exit                                                                                 |
| `kobato --help`, `-h`                 | Print the full help and exit                                                                               |
| `sayaka --help`, `-h`                 | Print the full help and exit                                                                               |
| `kobato --config <path>`, `-c <path>` | Use an explicit config file                                                                                |
| `kobato rollback`                     | Swap the `kobato.bak` sibling from the last self-update back into place; restart the service afterwards    |
| `kobato doctor [--json]`              | Diagnostic report: version, native libraries, config validation, self-update readiness; exits 1 on failure |

## Updates

kobato self-updates from the admin console (see below). **sayaka is updated by replacing its binary** — it has no
self-update surface: stop the sayaka service, swap the executable, start it again. Keep the pair on the same release
version.

## Self-update (kobato)

Bare-metal installations update from the admin console: open the version dialog → 检查更新 → 立即更新. The binary
downloads the release asset for the current platform, verifies the sha256, swaps the executable in place (the previous
one is kept as `kobato.bak`), and restarts. The update gate requires a non-development Linux x64/arm64 SEA build running
outside a container with a writable binary directory — Docker and Windows/macOS deployments update by replacing the
binary manually.

If an update misbehaves, run `kobato rollback` and restart the service.

## Backups

The admin console's backup job packs the content database, the analytics sidecar, and the effective `kobato.config.json`
into a single `.tar.gz` archive (optional password encryption). Legacy content-only `.db.gz` archives stay restorable.

## Building from source

```bash
pnpm run sea:build    # → dist-sea/kobato + dist-sea/sayaka (each with a .sha256 sidecar)
```

The build embeds the build machine's native libraries and Node executable, so build on the delivery target's platform
and architecture. It requires Node.js ≥ 26.10 (earlier 26.x ships a broken VFS addon loader on Linux). Companion
verification scripts: `pnpm run sea:smoke` (managed smoke over the pair), `pnpm run sea:probe` (VFS capability matrix),
`pnpm run sea:e2e` and `pnpm run sea:browser` (binary test suites over the booted pair).
