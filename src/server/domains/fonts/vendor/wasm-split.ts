import { create, toBinary } from '@bufbuild/protobuf'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WASI } from 'node:wasi'

import initWasm from '@/server/domains/fonts/vendor/cnfs.wasm?init'
import { InputTemplateSchema } from '@/server/domains/fonts/vendor/gen/api_pb'
import { getLogger } from '@/server/infra/logger'
import { getEmbeddedAsset, isSea } from '@/server/infra/sea'
import { SEA_WASM_CNFS_KEY } from '@/shared/sea/assets'

const log = getLogger('fonts.wasm')

// Under SEA the wasm bytes come from the embedded asset (see `@/shared/sea/assets`); instantiate per call like `?init`.
async function instantiateEmbeddedWasm(imports: WebAssembly.Imports): Promise<WebAssembly.Instance> {
  const bytes = getEmbeddedAsset(SEA_WASM_CNFS_KEY)
  if (bytes === null) {
    throw new Error(`Embedded wasm asset missing: ${SEA_WASM_CNFS_KEY}`)
  }
  // Fresh Uint8Array copy — `BufferSource` needs an ArrayBuffer-backed view, which `Buffer` isn't.
  const result = await WebAssembly.instantiate(new Uint8Array(bytes), imports)
  return result.instance
}

// Minimal WASM glue for the vendored cn-font-split wasm core via `node:wasi`;
// the binary is imported with Vite's `?init` query.

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

/** Run the wasm core against `props`, returning every file it emits (the caller partitions css vs chunks). Temp dir is always removed in `finally`. */
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

    // No-op pthread mutex stubs — the core links pthreads but runs single-threaded.
    const imports = {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        pthread_mutex_init: () => 0,
        pthread_mutex_lock: () => 0,
        pthread_mutex_unlock: () => 0,
        pthread_mutex_destroy: () => 0,
      },
    }

    // Fresh instance per call (`?init` semantics) — the core is stateful and runs `main` once.
    const instance = isSea() ? await instantiateEmbeddedWasm(imports) : await initWasm(imports)
    wasi.start(instance)

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
