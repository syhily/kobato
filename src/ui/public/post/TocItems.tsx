import { memo } from 'react'

import type { TocItem } from '@/shared/utils/toc'

export interface TocItemsProps {
  items: TocItem[]
  depth?: number
}

const MENU_CONTENT_INDENT = ['', 'pl-8', 'pl-16'] as const

function TocItemsImpl({ items, depth = 0 }: TocItemsProps) {
  const indent = MENU_CONTENT_INDENT[Math.min(depth, MENU_CONTENT_INDENT.length - 1)]
  return (
    <ul className="list-none p-0 leading-[1.8em]">
      {items.map((item) => (
        <li key={item.slug} className="overflow-hidden text-ellipsis">
          <a
            data-scroll
            className="relative block overflow-hidden px-10 py-1.5 text-toc-link text-ellipsis whitespace-nowrap text-ink-3 hover:bg-surface-dim hover:text-ink-1"
            href={`#${item.slug}`}
            title={item.text}
          >
            <span className={indent}>{item.text}</span>
          </a>
          {item.children.length > 0 && <TocItems items={item.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

export const TocItems = memo(TocItemsImpl)
