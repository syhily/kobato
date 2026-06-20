import { type ReactNode } from 'react'

import type { InklingImageCardNode } from '@/shared/inkling/schema'

import { sanitizeUrl } from '@/shared/sanitize-url'
import { cn } from '@/ui/lib/cn'
import { BlockImage } from '@/ui/pt/blocks/BlockImage'

function imageFigureLayoutClass(layout: InklingImageCardNode['layout']): string {
  const l = layout ?? 'center'
  return cn(
    'block max-w-full',
    l === 'left' && 'mr-auto ml-0 w-fit',
    l === 'center' && 'mx-auto w-fit',
    l === 'right' && 'mr-0 ml-auto w-fit',
  )
}

export function ImageBlock({ node }: { node: InklingImageCardNode }): ReactNode {
  return (
    <figure className={imageFigureLayoutClass(node.layout)}>
      <BlockImage
        src={sanitizeUrl(node.src)}
        alt={node.alt ?? ''}
        width={node.width}
        height={node.height}
        data-thumbhash={node.thumbhash}
      />
      {node.caption !== undefined && node.caption !== '' ? <figcaption>{node.caption}</figcaption> : null}
    </figure>
  )
}
