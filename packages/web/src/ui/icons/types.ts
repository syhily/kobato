import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  title?: string
}

export type LucideIcon = React.ComponentType<IconProps>

export type IconNode = Array<[string, Record<string, string>]>
