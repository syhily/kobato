// Ambient wildcard module declarations MUST stay in a non-module .d.ts: `declare module` inside a module file
// (env.d.ts) is an augmentation, not an ambient declaration. Used by src/inkling's svgr icons and the demo.
declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}

declare module '*.svg' {
  const content: string
  export default content
}
