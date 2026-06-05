import { createElement, forwardRef } from 'react'

import type { IconNode, IconProps, LucideIcon } from '@/ui/icons/types'

import { cn } from '@/ui/lib/cn'

export function createIcon(iconName: string, viewBox: string, iconNode: IconNode): LucideIcon {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    ({ className, size = '1em', title, children, ...rest }, ref) => {
      const hasA11y = title !== undefined || children !== undefined || 'aria-label' in rest || 'aria-labelledby' in rest

      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={viewBox}
          className={cn(`icon-${iconName}`, 'shrink-0 fill-current [vertical-align:-0.125em]', className)}
          width={size}
          height={size}
          fill="currentColor"
          focusable={false}
          role={title ? 'img' : undefined}
          aria-hidden={hasA11y ? undefined : true}
          {...rest}
        >
          {title ? <title>{title}</title> : null}
          {iconNode.map(([tag, attrs], index) => createElement(tag, { key: attrs.key ?? `node-${index}`, ...attrs }))}
          {children}
        </svg>
      )
    },
  )
  Component.displayName = iconName
  return Component
}
