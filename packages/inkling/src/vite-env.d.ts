/// <reference types="vite/client" />

declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}

declare module '*.svg' {
  const content: string
  export default content
}

declare const __APP_VERSION__: string

// Window augmentations for analytics
interface PlausibleWindow {
  plausible?: ((...args: unknown[]) => void) & { q?: unknown[] }
}

interface PosthogWindow {
  capture: (event: string, props?: Record<string, unknown>) => void
}

interface Window {
  plausible?: PlausibleWindow['plausible']
  posthog?: PosthogWindow
  __APP_VERSION__?: string
}
