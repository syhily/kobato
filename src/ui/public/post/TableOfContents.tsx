import { ChevronLeftIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'

import type { MarkdownHeading, TocOpts } from '@/shared/utils/toc'

import { transitions } from '@/client/lib/motion'
import { useSeoSettingsOptional } from '@/shared/lib/blog-config-context'
import { generateToC } from '@/shared/utils/toc'
import { cn } from '@/ui/lib/cn'
import { TocItems } from '@/ui/public/post/TocItems'

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

  const onToggle = useCallback(() => setVisible((prev) => !prev), [])

  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') {
        return
      }
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    }
  }, [])

  // Scroll-lock the page only when the drawer is actually open. Tying
  // it to `hovered` made the body gain a 15px padding-right every time
  // the cursor entered the toggle, which shoved every `fixed right-*`
  // chrome element (logged-in avatar, floating buttons) 15px leftward
  // and back on each hover/leave — visible page jitter.
  useEffect(() => {
    if (typeof document === 'undefined' || !visible) {
      return
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    }
  }, [visible])

  if (items.length === 0) {
    return null
  }

  return (
    <>
      <motion.button
        type="button"
        className={cn(
          'fixed top-0 right-0 bottom-0 my-auto flex cursor-pointer items-center justify-center',
          'rounded-full border border-line text-toc-toggle leading-none text-ink-3 shadow-toc-toggle',
          'transition-colors duration-500',
          'bg-canvas/90 hover:bg-surface',
          visible ? 'bg-surface' : 'bg-canvas/90',
        )}
        style={{ zIndex: 'var(--z-toc-toggle-open)' }}
        animate={{
          width: visible ? 50 : 100,
          height: visible ? 50 : 100,
          marginRight: visible ? -25 : -80,
          x: visible ? -280 : 0,
        }}
        whileHover={{
          width: visible ? 64 : 120,
          height: visible ? 64 : 120,
          marginRight: visible ? -32 : -80,
          x: visible ? -280 : -20,
        }}
        transition={transitions.drawer}
        aria-label={visible ? '关闭文章目录' : '展开文章目录'}
        aria-expanded={visible}
        onClick={onToggle}
      >
        <motion.span
          className="inline-flex"
          animate={{
            x: visible ? 0 : '-2.0875rem',
            rotate: visible ? 180 : 0,
          }}
          transition={transitions.drawer}
          aria-hidden
        >
          <ChevronLeftIcon className="text-md" size="1em" />
        </motion.span>
      </motion.button>

      <motion.div
        className="fixed top-0 bottom-0 z-(--z-toc-drawer-open) h-full w-toc-drawer border-l border-line bg-surface font-normal"
        style={{ right: 0 }}
        initial={false}
        animate={{ x: visible ? 0 : '100%' }}
        transition={transitions.drawer}
        inert={!visible}
        aria-hidden={!visible}
        tabIndex={visible ? undefined : -1}
      >
        <div className="absolute top-0 -right-12 bottom-0 left-0 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="mr-12 pt-11.5">
            <h2 className="w-full px-10 text-left text-toc-title leading-[3.6rem] font-bold text-ink-1">文章目录</h2>
            <div className="pt-8">
              <TocItems items={items} tabIndex={visible ? 0 : -1} />
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {visible && (
          <motion.div
            key="toc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitions.fade}
            className="fixed inset-0 z-(--z-toc-backdrop) bg-scrim"
            onClick={() => setVisible(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
