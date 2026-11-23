import { FONT_SPLIT_ADDON_SPEC, nativeRequire } from '@kobato/server/infra/sea/native-require'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export interface FontSplitCssProps {
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  fontDisplay?: string
}

export interface FontSplitProps {
  input: Uint8Array | ArrayBuffer
  css?: FontSplitCssProps
}

export interface FontSplitOutputFile {
  name: string
  data: Uint8Array
}

interface NativeFontSplitOptions {
  css?: Omit<FontSplitCssProps, 'fontWeight'> & { fontWeight?: string }
}

interface NativeBinding {
  fontSplit(input: Buffer, options?: NativeFontSplitOptions): Promise<FontSplitOutputFile[]>
}

let cached: NativeBinding | null = null

function loadBinding(): NativeBinding {
  if (cached !== null) {
    return cached
  }
  try {
    cached = unsafeCast<NativeBinding>(nativeRequire(FONT_SPLIT_ADDON_SPEC))
  } catch (error) {
    throw new Error(
      'font-split native addon is unavailable — build it with `pnpm --filter @kobato/font-split run build`',
      { cause: error },
    )
  }
  return cached
}

export async function fontSplit(props: FontSplitProps): Promise<FontSplitOutputFile[]> {
  const native = loadBinding()
  const input = props.input instanceof ArrayBuffer ? new Uint8Array(props.input) : props.input
  const options: NativeFontSplitOptions = {
    css: props.css
      ? {
          ...props.css,
          fontWeight: props.css.fontWeight !== undefined ? String(props.css.fontWeight) : undefined,
        }
      : undefined,
  }
  const outputs = await native.fontSplit(Buffer.from(input), options)
  return outputs.map((file) => ({ name: file.name, data: new Uint8Array(file.data) }))
}
