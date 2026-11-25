import type { ExternalControlAPI } from '@kobato/inkling'
import type { ChangeEvent, KeyboardEvent, Ref } from 'react'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
interface TitleTextBoxProps {
  title: string
  setTitle: (title: string) => void
  editorAPI: ExternalControlAPI | null
}

export interface TitleTextBoxRef {
  focus: () => void
}

export const TitleTextBox = forwardRef<TitleTextBoxRef, TitleTextBoxProps>(
  ({ title, setTitle, editorAPI }, ref: Ref<TitleTextBoxRef>) => {
    const titleEl = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      focus: () => {
        titleEl.current?.focus()
      },
    }))

    useEffect(() => {
      const el = titleEl.current
      if (!el || el.value !== title) {
        return
      }
      el.style.height = '58px'
      el.style.height = el.scrollHeight + 'px'
    }, [title])

    const handleTitleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
      setTitle(e.target.value)
    }

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!editorAPI) {
        return
      }

      const { key } = event
      const { value, selectionStart } = event.currentTarget

      const couldLeaveTitle = !value || selectionStart === value.length
      const arrowLeavingTitle = ['ArrowDown', 'ArrowRight'].includes(key) && couldLeaveTitle

      if (key === 'Enter' || key === 'Tab' || arrowLeavingTitle) {
        event.preventDefault()

        const editorIsEmpty = editorAPI.editorIsEmpty()
        if (key === 'Enter' && !editorIsEmpty) {
          editorAPI.insertParagraphAtTop({ focus: true })
        } else {
          editorAPI.focusEditor({ position: 'top' })
        }
      }
    }

    return (
      <textarea
        ref={titleEl}
        className="mb-3 w-full min-w-[auto] resize-none overflow-hidden bg-transparent pb-1 font-sans text-5xl font-bold text-black focus-visible:outline-none dark:text-white"
        data-testid="post-title"
        placeholder="Post title"
        value={title}
        onChange={handleTitleInput}
        onKeyDown={handleTitleKeyDown}
      />
    )
  },
)

TitleTextBox.displayName = 'TitleTextBox'

export default TitleTextBox
