import { create, toBinary } from '@bufbuild/protobuf'
import { SEA_WASM_CNFS_KEY } from '@kobato/distribution/sea-assets'
import initWasm from '@kobato/server/domains/fonts/vendor/cnfs.wasm?init'
import { InputTemplateSchema } from '@kobato/server/domains/fonts/vendor/gen/api_pb'
import { getLogger } from '@kobato/server/infra/logger'
import { isSea, seaAssetPath } from '@kobato/server/infra/sea/sea'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WASI } from 'node:wasi'

const log = getLogger('fonts.wasm')

async function instantiateEmbeddedWasm(imports: WebAssembly.Imports): Promise<WebAssembly.Instance> {
  const path = seaAssetPath(SEA_WASM_CNFS_KEY)
  if (path === null) {
    throw new Error(`Embedded wasm asset missing: ${SEA_WASM_CNFS_KEY}`)
  }
  const bytes = await readFile(path)
  const result = await WebAssembly.instantiate(new Uint8Array(bytes), imports)
  return result.instance
}

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

export async function fontSplit(props: FontSplitProps): Promise<FontSplitOutputFile[]> {
  const key = randomBytes(8).toString('hex')
  const root = await mkdtemp(join(tmpdir(), 'cnfs-'))

  try {
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

    const imports = {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        pthread_mutex_init: () => 0,
        pthread_mutex_lock: () => 0,
        pthread_mutex_unlock: () => 0,
        pthread_mutex_destroy: () => 0,
      },
    }

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
