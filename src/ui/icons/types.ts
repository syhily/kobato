import type { RefAttributes, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string
  title?: string
}

export type LucideIcon = React.ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

export type IconNode = Array<[string, Record<string, string>]>
