/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { RefObject } from 'react'

import { SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Form, useNavigate } from 'react-router'

import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { Input } from '@/ui/components/input'
import { cn } from '@/ui/lib/cn'
import { Popup } from '@/ui/public/widgets/Popup'

const sidebarSearchInputClass = cn(
  'relative block w-full',
  'rounded-sm border-0 px-4 py-2',
  'bg-surface',
  'transition-colors',
  'hover:border-line-muted focus:border-line-muted',
  'focus:shadow-none focus:outline-0',
)

export function SearchBar() {
  const navigate = useNavigate()
  return (
    <div id="search" className="mb-10">
      <Form
        method="get"
        action="/search"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.currentTarget
          const q = new FormData(form).get('q') as string
          if (q.trim()) {
            void navigate(`/search/${encodeURIComponent(q.trim())}`)
          }
        }}
      >
        <label htmlFor="sidebar-search-input" className="sr-only">
          文章寻踪
        </label>
        <input
          id="sidebar-search-input"
          type="search"
          className={sidebarSearchInputClass}
          placeholder="文章寻踪（输入后回车）"
          name="q"
          required
          enterKeyHint="search"
          aria-label="文章寻踪"
        />
      </Form>
    </div>
  )
}

const SEARCH_POPUP_ID = 'global-search'

export function SearchIconButton() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupInputRef = useRef<HTMLInputElement | null>(null)
  const handleClose = useCallback(() => setOpen(false), [])
  const focusPopupInput = useCallback(() => {
    popupInputRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDocClick = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) {
        return
      }
      const popup = document.querySelector<HTMLElement>(`[data-popup-id="${SEARCH_POPUP_ID}"]`)
      if (popup?.contains(event.target as Node)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  return (
    <>
      <Button
        ref={triggerRef}
        variant="dark"
        size="iconSm"
        shape="circle"
        title="搜索"
        aria-label="打开搜索"
        onClick={(event) => {
          event.stopPropagation()
          flushSync(() => setOpen(true))
          focusPopupInput()
        }}
      >
        <IconButtonContent>
          <SearchIcon size="1em" aria-hidden className="m-icon-inset" />
        </IconButtonContent>
      </Button>
      <SearchPopup open={open} onClose={handleClose} inputRef={popupInputRef} />
    </>
  )
}

interface SearchPopupProps {
  open: boolean
  onClose: () => void
  inputRef: RefObject<HTMLInputElement | null>
}

function SearchPopup({ open, onClose, inputRef }: SearchPopupProps) {
  const navigate = useNavigate()
  return (
    <Popup open={open} onClose={onClose} size="md" popupId={SEARCH_POPUP_ID} aria-label="搜索文章">
      <Form
        className="text-center"
        method="get"
        action="/search"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.currentTarget
          const q = new FormData(form).get('q') as string
          if (q.trim()) {
            void navigate(`/search/${encodeURIComponent(q.trim())}`)
            onClose()
          }
        }}
      >
        <div className="px-4 py-4 md:px-12 md:py-8">
          <div className="mx-auto max-w-sm">
            <div className="mb-4 md:mb-6">
              <Input
                ref={inputRef}
                type="search"
                name="q"
                required
                enterKeyHint="search"
                size="lg"
                className="bg-canvas text-center"
                placeholder="搜索并回车"
                aria-label="搜索文章"
              />
            </div>
            <Button type="submit" variant="default" size="lg" block>
              搜索
            </Button>
          </div>
        </div>
      </Form>
    </Popup>
  )
}
