// Ambient wildcard module declarations — MUST stay in a non-module .d.ts
// (env.d.ts is a module, where `declare module` would be an augmentation
// instead of an ambient declaration). Consumed by src/inkling's svgr icons
// and the demo.
declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}

declare module '*.svg' {
  const content: string
  export default content
}
