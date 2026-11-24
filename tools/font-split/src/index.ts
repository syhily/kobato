import { createRequire } from 'node:module'
import { join } from 'node:path'

export interface FontSplitCssProps {
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  fontDisplay?: string
  localFamily?: string[]
  commentBase?: boolean
  commentNameTable?: boolean
  commentUnicodes?: boolean
  compress?: boolean
  fileName?: string
}

export interface FontSplitProps {
  input: Uint8Array | ArrayBuffer
  css?: FontSplitCssProps
  chunkSize?: number
  languageAreas?: boolean
  fontFeature?: boolean
  reduceMins?: boolean
  autoSubset?: boolean
  subsetRemainChars?: boolean
  renameOutputFont?: string
}

export interface FontSplitOutputFile {
  name: string
  data: Uint8Array
}

interface NativeFontSplitOptions {
  css?: Omit<FontSplitCssProps, 'fontWeight'> & { fontWeight?: string }
  chunkSize?: number
  languageAreas?: boolean
  fontFeature?: boolean
  reduceMins?: boolean
  autoSubset?: boolean
  subsetRemainChars?: boolean
  renameOutputFont?: string
}

interface NativeBinding {
  fontSplit(input: Buffer, options?: NativeFontSplitOptions): Promise<FontSplitOutputFile[]>
  fontSplitAlgorithmVersion(): string
}

let cached: NativeBinding | null = null

export function loadNativeBinding(): NativeBinding {
  if (cached !== null) {
    return cached
  }
  const nodeRequire = createRequire(import.meta.url)
  const addonPath = join(import.meta.dirname, '..', 'font-split.node')
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the .node addon is untyped; src/binding.rs defines the shape
    cached = nodeRequire(addonPath) as NativeBinding
  } catch (error) {
    throw new Error(
      '@kobato/font-split native addon is not built — run `pnpm --filter @kobato/font-split run build` first',
      { cause: error },
    )
  }
  return cached
}

export function fontSplitAlgorithmVersion(): string {
  return loadNativeBinding().fontSplitAlgorithmVersion()
}

export async function fontSplit(props: FontSplitProps): Promise<FontSplitOutputFile[]> {
  const native = loadNativeBinding()
  const { input, css, ...rest } = props
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input
  const options: NativeFontSplitOptions = {
    ...rest,
    css: css
      ? {
          ...css,
          fontWeight: css.fontWeight !== undefined ? String(css.fontWeight) : undefined,
        }
      : undefined,
  }
  const outputs = await native.fontSplit(Buffer.from(bytes), options)
  return outputs.map((file) => ({ name: file.name, data: new Uint8Array(file.data) }))
}
