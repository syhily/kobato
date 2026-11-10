# Deployment

Every release ships a self-contained single executable — no Node.js runtime,
no `node_modules`, no database server. The server bundle, client assets, and
database migrations are embedded in the binary; the native packages (sharp,
canvas, DuckDB) extract to a cache directory on first run.

Targets: `linux-x64`, `linux-arm64` (glibc), `darwin-arm64`, `win32-x64`, and
`win32-arm64`.

## Install from a release

Download the archive for your platform (e.g. `kobato-linux-x64.tar.gz`) and
its `.sha256` sidecar from the [latest release](https://github.com/syhily/kobato/releases/latest),
verify, extract, and install:

```bash
sha256sum -c kobato-linux-x64.tar.gz.sha256
tar -xzf kobato-linux-x64.tar.gz
install -m 0755 kobato-linux-x64 /usr/local/bin/kobato
kobato --version          # prints the baked-in version
```

The linux-x64 release additionally ships a Debian package
(`kobato_<version>_amd64.deb` + `.sha256`).

## First boot

On first boot the binary creates `kobato.config.json` next to itself with
defaults (see [Configuration](Configuration.md)). `storage.data` defaults to
`./data` relative to the working directory — set it explicitly for a system
install, either by editing the file or by passing `__`-style environment
variables once and letting them be written into the file:

```ini
Environment=storage__data=/var/lib/kobato
```

Database migrations run automatically at boot. The native libraries extract
into the cache directory on first run — `$XDG_CACHE_HOME/kobato` (or
`~/.cache/kobato`) on Linux/macOS, `%LOCALAPPDATA%\kobato` on Windows,
overridable with `KOBATO_CACHE_DIR`.

Once the server is up, open `/admin/setup` and enter the setup token printed
in the console (it stays valid until the first admin is created) to create
the admin account. Settings are seeded automatically.

## Running as a service

A minimal systemd unit:

```ini
[Unit]
Description=Kobato blog CMS
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

On Windows there is no SIGTERM — shutdown relies on Ctrl+C signals, so wrap
the binary with a service wrapper such as WinSW or NSSM (stop = send Ctrl+C).

## Command-line reference

| Command                               | Effect                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `kobato`                              | Start the server                                                                                           |
| `kobato --version`, `-v`              | Print the version and exit                                                                                 |
| `kobato --help`, `-h`                 | Print the full help and exit                                                                               |
| `kobato --config <path>`, `-c <path>` | Use an explicit config file                                                                                |
| `kobato rollback`                     | Swap the `kobato.bak` sibling from the last self-update back into place; restart the service afterwards    |
| `kobato doctor [--json]`              | Diagnostic report: version, native libraries, config validation, self-update readiness; exits 1 on failure |

## Self-update

Bare-metal installations update from the admin console: open the version
dialog → 检查更新 → 立即更新. The binary downloads the release asset for the
current platform, verifies the sha256, swaps the executable in place (the
previous one is kept as `kobato.bak`), and restarts. The update gate requires
a non-development Linux x64/arm64 SEA build running outside a container with
a writable binary directory — Docker and Windows/macOS deployments update by
replacing the binary manually.

If an update misbehaves, run `kobato rollback` and restart the service.

## Backups

The admin console's backup job packs the content database, the analytics
sidecar, and the effective `kobato.config.json` into a single `.tar.gz`
archive (optional password encryption). Legacy content-only `.db.gz` archives
stay restorable.

## Building from source

```bash
pnpm run sea:build    # → dist-sea/kobato + .sha256
```

The build embeds the build machine's native libraries and Node executable,
so build on the delivery target's platform and architecture. It requires
Node.js ≥ 26.10 (earlier 26.x ships a broken VFS addon loader on Linux).
Companion verification scripts: `pnpm run sea:smoke` (managed smoke suite),
`pnpm run sea:probe` (VFS capability matrix), `pnpm run sea:e2e` and
`pnpm run sea:browser` (binary test suites).
