import { create, toBinary } from '@bufbuild/protobuf'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WASI } from 'node:wasi'

import wasmBytes from '@/server/domains/fonts/vendor/cnfs.wasm?binary'
import { InputTemplateSchema } from '@/server/domains/fonts/vendor/gen/api_pb'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('fonts.wasm')

// Minimal WASM glue for the vendored cn-font-split wasm core, driven by
// Node's built-in `node:wasi` (which binds `node:fs` directly——no
// `memfs-browser` / `@tybys/wasm-util` needed). The wasm binary is imported
// via Vite's `?url` query, giving us a build-time asset URL that resolves to
// the emitted `.wasm` file relative to the server bundle.
//
// The wasm core expects: a serialized `InputTemplate` protobuf at
// `/tmp/fonts/<key>` (WASI preopens-relative), and writes its outputs
// (`result.css` + `chunk-*.woff2`) into `/tmp/<key>/`. We expose a real OS
// temp directory as the wasm's `/` and use a random `key` so concurrent
// slice calls don't collide.

export interface FontSplitCssProps {
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  fontDisplay?: string
}

export interface FontSplitProps {
  input: Uint8Array | ArrayBuffer
  outDir?: string
  css?: FontSplitCssProps
  chunkSize?: number
  chunkSizeTolerance?: number
  languageAreas?: boolean
  autoSubset?: boolean
  reporter?: boolean
  buildMode?: string
}

export interface FontSplitOutputFile {
  name: string
  data: Uint8Array
}

/**
 * Run the cn-font-split wasm core against `props`, returning every file the
 * core emits. The caller (slice.ts) partitions these into `result.css` +
 * woff2 chunks. The OS temp directory backing the WASI preopen is removed in
 * `finally`, so a thrown error never leaks it.
 */
export async function fontSplit(props: FontSplitProps): Promise<FontSplitOutputFile[]> {
  const key = randomBytes(8).toString('hex')
  const root = await mkdtemp(join(tmpdir(), 'cnfs-'))

  try {
    // The wasm core reads `/tmp/fonts/<key>` and writes `/tmp/<key>/`.
    await mkdir(join(root, 'tmp', 'fonts'), { recursive: true })
    await mkdir(join(root, 'tmp', key), { recursive: true })

    const inputBytes = props.input instanceof ArrayBuffer ? new Uint8Array(props.input) : props.input
    const message = create(InputTemplateSchema, {
      input: inputBytes,
      outDir: props.outDir,
      css: props.css
        ? {
            fontFamily: props.css.fontFamily,
            fontWeight: props.css.fontWeight !== undefined ? String(props.css.fontWeight) : undefined,
            fontStyle: props.css.fontStyle,
            fontDisplay: props.css.fontDisplay,
          }
        : undefined,
      chunkSize: props.chunkSize,
      chunkSizeTolerance: props.chunkSizeTolerance,
      languageAreas: props.languageAreas,
      autoSubset: props.autoSubset,
      reporter: props.reporter,
      buildMode: props.buildMode,
    })
    const serialized = toBinary(InputTemplateSchema, message)
    log.info('Protobuf serialized', { key, totalBytes: serialized.length, inputBytes: inputBytes.length })
    await writeFile(join(root, 'tmp', 'fonts', key), Buffer.from(serialized))

    const wasi = new WASI({
      version: 'preview1',
      args: [key],
      env: { WASI_SDK_PATH: '/opt/wasi-sdk', RUST_LOG: 'info' },
      preopens: { '/': root },
    })

    // The wasm core is single-threaded and expects the wasm-threads pthread
    // mutex stubs (it links against pthreads but runs single-threaded under
    // WASI). Provide no-op implementations so imports resolve.
    const imports = {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        pthread_mutex_init: () => 0,
        pthread_mutex_lock: () => 0,
        pthread_mutex_unlock: () => 0,
        pthread_mutex_destroy: () => 0,
      },
    }

    // Compile + instantiate separately to avoid the Node 24 type ambiguity:
    // `WebAssembly.instantiate(bytes, imports)` returns `{module, instance}`
    // while the TS types declare it as bare `Instance`. The two-step form
    // (`compile` then `instantiate(module, imports)`) is well-typed and
    // unambiguous on every Node version.
    const module = await WebAssembly.compile(Buffer.from(wasmBytes))
    const instance = await WebAssembly.instantiate(module, imports)
    wasi.start(instance)

    // Read back everything the core wrote into <root>/tmp/<key>/.
    const outDir = join(root, 'tmp', key)
    const names = await readdir(outDir)
    log.info('Wasm output files', { key, fileCount: names.length, names })
    const files: FontSplitOutputFile[] = []
    for (const name of names) {
      const data = await readFile(join(outDir, name))
      files.push({ name, data: new Uint8Array(data) })
    }
    return files
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
