import { ChevronLeftIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { MarkdownHeading } from '@/shared/types/catalog'
import type { TocOpts } from '@/shared/utils/toc'

import { useSeoSettingsOptional } from '@/shared/lib/blog-config-context'
import { generateToC } from '@/shared/utils/toc'
import { cn } from '@/ui/lib/cn'
import { TocItems } from '@/ui/public/post/TocItems'

const tocToggleClass = cn(
  'fixed top-0 right-[var(--scrollbar-width,0px)] bottom-0 z-(--z-toc-toggle) my-auto -mr-20',
  'flex h-toc-disc w-toc-disc cursor-pointer items-center justify-center',
  'transform-gpu',
  'rounded-full border border-line bg-canvas/90',
  'text-toc-toggle leading-none text-ink-3 shadow-toc-toggle',
  'transition-[background-color,color,transform,translate,scale,rotate,box-shadow,width,height,margin] duration-500 ease-in-out',
  'hover:h-toc-disc-hover hover:w-toc-disc-hover hover:-translate-x-5 hover:bg-surface',
  'data-[state=open]:z-(--z-toc-toggle-open) data-[state=open]:-mr-toc-toggle-edge-open data-[state=open]:h-toc-disc-open data-[state=open]:w-toc-disc-open data-[state=open]:-translate-x-toc-drawer data-[state=open]:bg-surface',
  'data-[state=open]:hover:-mr-8 data-[state=open]:hover:h-toc-disc-open-hover data-[state=open]:hover:w-toc-disc-open-hover data-[state=open]:hover:-translate-x-toc-drawer',
)

const tocToggleIconWrapperClass = cn(
  'inline-flex transform-gpu transition-transform duration-500 ease-in-out',
  '-translate-x-[2.0875rem]',
  'data-[state=open]:translate-x-0 data-[state=open]:rotate-180',
)

const tocDrawerClass = cn(
  'fixed top-0 -right-toc-drawer-edge bottom-0 z-(--z-toc-drawer) h-full w-toc-drawer transform-gpu border-l border-line bg-surface font-normal transition-transform duration-500 ease-in-out',
  'data-[state=open]:z-(--z-toc-drawer-open) data-[state=open]:-translate-x-toc-drawer',
)

const tocBackdropClass = cn(
  'pointer-events-none invisible',
  'data-[state=open]:pointer-events-auto data-[state=open]:visible data-[state=open]:fixed data-[state=open]:inset-0 data-[state=open]:z-(--z-toc-backdrop) data-[state=open]:bg-scrim',
)

const DEFAULT_TOC_CONFIG = {
  maxHeadingLevel: 4,
  minHeadingLevel: 2,
} satisfies TocOpts

export interface TableOfContentsProps {
  headings: MarkdownHeading[]
  toc?: 'enabled' | 'disabled'
}

export function TableOfContents({ headings, toc = 'disabled' }: TableOfContentsProps) {
  const seo = useSeoSettingsOptional()
  const generateTocConfig = toc === 'enabled' ? (seo?.toc ?? DEFAULT_TOC_CONFIG) : false
  const items = generateToC(headings, generateTocConfig)
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(false)

  const onToggle = useCallback(() => setVisible((prev) => !prev), [])

  const onPointerEnter = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === 'touch') {
      return
    }
    setHovered(true)
  }, [])
  const onPointerLeave = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === 'touch') {
      return
    }
    setHovered(false)
  }, [])

  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') {
        return
      }
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
      document.body.style.removeProperty('--scrollbar-width')
    }
  }, [])

  const lock = hovered || visible
  useEffect(() => {
    if (typeof document === 'undefined' || !lock) {
      return
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
      document.body.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`)
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
      document.body.style.removeProperty('--scrollbar-width')
    }
  }, [lock])

  if (items.length === 0) {
    return null
  }

  const state = visible ? 'open' : 'closed'

  return (
    <>
      <button
        type="button"
        data-state={state}
        className={tocToggleClass}
        aria-label={visible ? '关闭文章目录' : '展开文章目录'}
        aria-expanded={visible}
        onClick={onToggle}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <span data-state={state} className={tocToggleIconWrapperClass} aria-hidden>
          <ChevronLeftIcon className="text-md" size="1em" />
        </span>
      </button>
      <div data-state={state} className={tocDrawerClass}>
        <div className="absolute top-0 -right-12 bottom-0 left-0 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mr-12 pt-11.5">
            <h2 className="w-full px-10 text-left text-toc-title leading-[3.6rem] font-bold text-ink-1">文章目录</h2>
            <div className="pt-8">
              <TocItems items={items} />
            </div>
          </div>
        </div>
      </div>
      <div data-state={state} className={tocBackdropClass} onClick={() => setVisible(false)} />
    </>
  )
}
