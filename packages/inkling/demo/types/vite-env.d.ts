import 'react'

declare global {
  interface ViteTypeOptions {
    strictImportMetaEnv: unknown
  }

  interface ImportMetaEnv {
    readonly VITE_KLIPY_API_KEY?: string
    readonly VITE_TENOR_API_KEY?: string
    readonly VITE_PINTURA_JS_URL?: string
    readonly VITE_PINTURA_CSS_URL?: string
    readonly VITE_TEST?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number
  }
}
