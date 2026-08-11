import type { Editor } from '@tiptap/core'

import { useEditorState } from '@tiptap/react'

import {
  applyBlockStyle,
  BLOCK_STYLE_BUTTONS,
  BLOCK_STYLE_OPTIONS,
  getActiveBlockStyle,
} from '@/ui/admin/editor/toolbar/style-helpers'
import { ToolbarButton } from '@/ui/admin/editor/toolbar/ToolbarButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

interface BlockStyleProps {
  editor: Editor
  disabled?: boolean
}

export function BlockStyleSelect({ editor, disabled }: BlockStyleProps) {
  const active = useEditorState({ editor, selector: ({ editor: ed }) => getActiveBlockStyle(ed) })
  return (
    <Select
      value={active}
      onValueChange={(value: string | null) => {
        if (typeof value === 'string') {
          applyBlockStyle(editor, value)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="h-8 min-w-30" aria-label="段落样式">
        {/* Base UI's Select.Value defaults to rendering the raw `value`
            string (e.g. "h2" / "codeBlock") when no child render
            function is supplied. We map back to the Chinese label so
            the trigger matches the dropdown options. */}
        <SelectValue placeholder="段落样式">
          {(value) => {
            const match = BLOCK_STYLE_OPTIONS.find((option) => option.value === value)
            return match?.label ?? '段落样式'
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {BLOCK_STYLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function BlockStyleButtons({ editor, disabled }: BlockStyleProps) {
  const active = useEditorState({ editor, selector: ({ editor: ed }) => getActiveBlockStyle(ed) })
  return (
    <>
      {BLOCK_STYLE_BUTTONS.map(({ value, title, Icon }) => (
        <ToolbarButton
          key={value}
          title={title}
          disabled={disabled}
          state={active === value ? 'active' : 'inactive'}
          onClick={() => applyBlockStyle(editor, value)}
        >
          <Icon />
        </ToolbarButton>
      ))}
    </>
  )
}
