# Fonts

Self-hosted web-font slicing. `slice.ts` drives the vendored cn-font-split Rust wasm core through Node's built-in
`node:wasi` (binding `node:fs` directly) — zero runtime wasm/fs npm dependencies. The wasm binary is imported with
Vite's native `?init` query: no plugin, no base85 inlining.

`vendor/` is a deliberate snapshot: npm publishes cn-font-split `7.4.3` while the Rust core has advanced on GitHub, so
we pair the Rust wasm binary with a minimal JS glue layer we control plus an `@bufbuild/protobuf` encoder generated from
the upstream proto — the only contract between JS and the wasm core.

## Vendor files

| File                   | Source                                                     | Role                                                     |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `vendor/api.proto`     | `crates/proto/src/index.proto` (upstream `release` branch) | Schema source of truth (the JS↔wasm contract)            |
| `vendor/gen/api_pb.ts` | Generated with `protoc-gen-es` (committed)                 | `@bufbuild/protobuf` `InputTemplate` encoder             |
| `vendor/cnfs.wasm`     | GitHub release `7.6.8` → `libffi-wasm32-wasip1.wasm`       | The Rust slicing core                                    |
| `vendor/wasm-split.ts` | This repo (ported from upstream `packages/ffi-js`)         | `fontSplit(props)` — `node:wasi` glue that runs the core |

`node:wasi` binds `node:fs` directly with a real OS temp directory as the wasm's `/`; the SSR build emits the `.wasm`
next to the server bundle and reads it via `import.meta.url`. `protoc` is never a build or runtime dependency.

## Updating

- **wasm binary (manual)** — download `libffi-wasm32-wasip1.wasm` for the target release over `vendor/cnfs.wasm`, record
  the sha256 below, and rely on the real-TTF `sliceFont` unit test as the schema-drift guard.
- **proto + encoder** — regenerate `vendor/gen/api_pb.ts` from `vendor/api.proto` with `protoc-gen-es` (requires
  `protoc` on PATH; no repo script exists) and commit; re-fetch `api.proto` from the upstream `release` branch if the
  schema changes.

## Pinned versions

- `vendor/cnfs.wasm` — release `7.6.8`, sha256 `05a88dcb9a0b0d1e14daf0f429d9af6e2ac8d94d9e574523a76d3e9f440dccc9`
- `api.proto` — upstream `release` branch (byte-identical across 7.4.3 / 7.6.8)
- `@bufbuild/protobuf` / `protoc-gen-es` — `2.12.0`
