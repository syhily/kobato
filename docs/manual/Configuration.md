# Configuration

Kobato splits configuration into two layers:

- **Runtime settings** — site identity, SEO, comments, navigation, assets,
  analytics, observability, and everything else users touch live in the admin
  console's settings sections, stored in the database.
- **Infrastructure** — secrets, listen address, and data paths live in
  **`kobato.config.json`**, validated at boot. Observability has no entry here;
  it is configured exclusively in the admin console.

## The config file

`kobato.config.json` is always present: it is auto-created with defaults when
missing (file mode `0600`). The first existing file wins:

1. `--config <path>` / `-c <path>` — explicit; the file is created at this
   path if missing
2. `KOBATO_CONFIG_FILE` — dev tooling; resolved against the working directory,
   also treated as explicit
3. `<binary dir>/kobato.config.json` — SEA binary only
4. `./kobato.config.json`
5. `~/.config/kobato.config.json`

See [`kobato.config.example.json`](../../kobato.config.example.json) for the
full shape:

```jsonc
{
  "server": {
    "host": "0.0.0.0",
    "port": 4321,
    "loggingLevel": "info",
  },
  "security": {
    "sessionSecret": "",
    "encryptionKey": "",
    "trustedProxies": [],
  },
  "storage": {
    "data": "./data",
    "defaultFont": "",
    "database": "",
    "analyticsDatabase": "",
  },
}
```

## Environment variables

Every config path can be set with an environment variable named after the
nested path joined with a double underscore. Env values override the file
**and are written back into it** — the file converges to the effective
configuration, so env is the injection mechanism for services and the file is
the record. Precedence: schema defaults < config file < environment.

| Variable                     | Config path                 | Description                                                                   |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `storage__data`              | `storage.data`              | Root data directory for databases, fonts, uploads, and the MaxMind DB         |
| `storage__database`          | `storage.database`          | SQLite content database file, default `<data>/kobato.db`                      |
| `storage__analyticsDatabase` | `storage.analyticsDatabase` | DuckDB analytics sidecar file, default `<data>/analytics.duckdb`              |
| `storage__defaultFont`       | `storage.defaultFont`       | Optional fallback font file seeded into `<data>/fonts`                        |
| `security__sessionSecret`    | `security.sessionSecret`    | HMAC secret signing session cookies; generate with `openssl rand -hex 32`     |
| `security__encryptionKey`    | `security.encryptionKey`    | AES-256-GCM key encrypting secrets stored in the database                     |
| `security__trustedProxies`   | `security.trustedProxies`   | Comma-separated proxy IPs / IPv4 CIDRs trusted to vouch for forwarded headers |
| `server__host`               | `server.host`               | Listen address, default `0.0.0.0`                                             |
| `server__port`               | `server.port`               | Listen port, default `4321`                                                   |
| `server__loggingLevel`       | `server.loggingLevel`       | `debug` / `info` / `warn` / `error` / `silent`                                |

## Secrets

Generate both with `openssl rand -hex 32`; boot fails until they validate:

- `security.sessionSecret` — at least 32 characters. A comma-separated list
  accepts multiple secrets: the first signs new cookies, the rest keep
  validating existing sessions, so rotation does not log everyone out.
- `security.encryptionKey` — at least 32 characters with at least 10 distinct
  characters (weak repeated keys are rejected). It encrypts secrets at rest in
  the database; changing it makes previously stored secrets unreadable.

## Trusted proxies

`security.trustedProxies` lists the direct peers allowed to vouch for
forwarded headers (`X-Forwarded-For` and friends): exact IP addresses or IPv4
CIDRs, comma-separated in the string form or a JSON array in the file form.

- Empty (the default) → only loopback peers are trusted.
- An entry of `0.0.0.0/0` is rejected at boot — it would trust every peer and
  silently disable all per-IP rate limits and audit attribution.

Behind Docker or a reverse proxy, trust the overlay subnet, e.g.
`172.18.0.0/16`.

## Data directory

`storage.data` (default `./data`, relative to the working directory) holds
everything persistent:

```
<data>/
├── kobato.db          # SQLite content database
├── analytics.duckdb   # DuckDB analytics sidecar
├── fonts/             # fonts for canvas-rendered images
├── storage/           # local upload backend (when S3 storage is off)
├── maxmind/           # GeoLite2-City.mmdb for GeoIP enrichment
├── analytics/         # dead-letter queues
├── audit/             # dead-letter queues
└── cache/             # disposable; excluded from backups
```

`storage.database` and `storage.analyticsDatabase` override the two database
files; empty means the defaults above. `storage.defaultFont` points at a font
file copied into `<data>/fonts` on boot (existing files are never
overwritten) for server-rendered images.

## Legacy config files

Older layouts keep loading: `auth.sessionSecret` moves to
`security.sessionSecret`, `paths.*` to `storage.*`, and `logging.level` to
`server.loggingLevel`; removed sections (`redis`, the pre-SQLite `database`)
are dropped. Moves are written back in place and reported on stderr.
