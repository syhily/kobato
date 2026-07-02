import React, { useEffect, useRef } from 'react'

import CloseIcon from '@/ui/inkling-editor/assets/icons/inkling-close.svg?react'

interface LinkInputProps {
  href?: string
  update: (href: string) => void
  cancel: () => void
}

export function LinkInput({ href, update, cancel }: LinkInputProps) {
  const [_href, setHref] = React.useState<string | undefined>(href)

  // add refs for input and container
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // update the href when the prop changes
  React.useEffect(() => {
    setHref(href)
  }, [href])

  // when link is open, focus the input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // when link is open, watch the window for mousedown events so that we can
  // close it when we detect a click outside
  const closeOnClickOutside = React.useCallback(
    (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        cancel()
      }
    },
    [cancel],
  )

  React.useEffect(() => {
    window.addEventListener('mousedown', closeOnClickOutside)
    return () => {
      window.removeEventListener('mousedown', closeOnClickOutside)
    }
  }, [closeOnClickOutside])

  // when link is open, watch the window for escape keydown events so that we can exit
  const onEscape = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel()
      }
    },
    [cancel],
  )

  React.useEffect(() => {
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('keydown', onEscape)
    }
  }, [onEscape])

  return (
    <div
      ref={containerRef}
      className="relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white p-1 font-sans text-md font-normal text-black shadow-md dark:bg-grey-950"
    >
      <input
        ref={inputRef}
        className="mb-[1px] h-8 w-full pl-3 leading-loose text-grey-900 selection:bg-grey/40 dark:bg-grey-950 dark:text-grey-300 dark:selection:bg-grey-800/40 dark:selection:text-grey-100"
        data-testid="link-input"
        name="link-input"
        placeholder="Enter url"
        value={_href}
        data-inkling-link-input
        // yufan.me: React 19 types — onInput passes InputEvent; use currentTarget.
        onInput={(e) => {
          setHref(e.currentTarget.value)
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter') {
            // prevent Enter from triggering in the editor and removing text
            e.preventDefault()
            update(_href || '')
            return
          }
        }}
      />

      {!!_href && (
        <button
          aria-label="Close"
          className="absolute right-3 cursor-pointer"
          type="button"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            setHref('')
            inputRef.current?.focus()
          }}
        >
          <CloseIcon className="size-4 stroke-2 text-grey" />
        </button>
      )}
    </div>
  )
}
