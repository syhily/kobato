import React, { useRef, useState } from 'react'

import { Dropdown } from '@/components/ui/SnippetInput/Dropdown'
import { Input } from '@/components/ui/SnippetInput/Input'
import { initialSlot, nextSlot, previousSlot, slotToItemIndex } from '@/components/ui/SnippetInput/snippet-navigator'
import { type SnippetItem } from '@/context/InklingHostIntegrationContext'

interface SnippetInputProps {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCreateSnippet?: () => void
  onUpdateSnippet?: (name: string) => void
  onClose?: () => void
  snippets?: SnippetItem[]
}

export function SnippetInput({
  value = '',
  onChange,
  onCreateSnippet,
  onUpdateSnippet,
  onClose,
  snippets = [],
}: SnippetInputProps) {
  const snippetRef = useRef<HTMLDivElement | null>(null)
  // one slot ring (snippet-navigator): 0 is the create button, 1..N the items
  const [activeSlot, setActiveSlot] = useState(0)
  const isCreateButtonActive = activeSlot === 0
  const activeMenuItem = slotToItemIndex(activeSlot)
  // derived from the query and the snippet list — no state needed
  const suggestedList = React.useMemo(
    () => snippets.filter((snippet) => snippet.name.toLowerCase().includes(value.toLowerCase())),
    [value, snippets],
  )

  // default to first snippet or create new button — adjusted during render
  // when the query or snippet list changes
  const [prevFilterInputs, setPrevFilterInputs] = useState({ value, snippets })
  if (prevFilterInputs.value !== value || prevFilterInputs.snippets !== snippets) {
    setPrevFilterInputs({ value, snippets })
    setActiveSlot(initialSlot(suggestedList.length))
  }

  // close snippets menu if clicked outside the input/dropdown
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (snippetRef.current && target instanceof Node && !snippetRef.current.contains(target)) {
        onClose?.()
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.stopPropagation()
      onClose?.()
    }

    if (event.key === 'ArrowDown' || event.key === 'Down') {
      event.stopPropagation()
      event.preventDefault()

      if (suggestedList.length === 0) {
        return
      }

      setActiveSlot(nextSlot(activeSlot, suggestedList.length))
    }

    if (event.key === 'ArrowUp' || event.key === 'Up') {
      event.stopPropagation()
      event.preventDefault()

      if (suggestedList.length === 0) {
        return
      }

      setActiveSlot(previousSlot(activeSlot, suggestedList.length))
    }

    if (event.key === 'Enter') {
      if (isCreateButtonActive) {
        event.stopPropagation()
        event.preventDefault()
        onCreateSnippet?.()
      } else if (activeMenuItem > -1) {
        event.stopPropagation()
        event.preventDefault()
        onUpdateSnippet?.(suggestedList[activeMenuItem].name)
      }
    }
  }

  return (
    <div
      ref={snippetRef}
      onClick={(e) => e.stopPropagation()} // prevents card from losing selected state
    >
      <Input value={value} onChange={onChange} onClear={onClose} onKeyDown={handleInputKeyDown} />
      {!!value && (
        <Dropdown
          activeMenuItem={activeMenuItem}
          isCreateButtonActive={isCreateButtonActive}
          snippets={suggestedList}
          value={value}
          onCreateSnippet={onCreateSnippet}
          onUpdateSnippet={onUpdateSnippet}
        />
      )}
    </div>
  )
}
