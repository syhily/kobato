import type { LexicalEditor } from 'lexical'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/editor/engine/components/select'
import { applyBlockStyle } from '@kobato/editor/engine/lexical/block-commands'
import { BLOCK_STYLE_BUTTONS, BLOCK_STYLE_OPTIONS } from '@kobato/editor/engine/toolbar/style-helpers'
import { ToolbarButton } from '@kobato/editor/engine/toolbar/ToolbarButton'

// Lexical counterparts of the tiptap `BlockStyleSelect` / `BlockStyleButtons`.
// The option catalogue (`BLOCK_STYLE_OPTIONS` / `BLOCK_STYLE_BUTTONS`) is
// shared with the tiptap engine — the values map 1:1 onto the Lexical
// block commands. The active value comes from the toolbar selection state.

interface BlockStyleProps {
  editor: LexicalEditor
  active: string
  disabled?: boolean
}

export function BlockStyleSelect({ editor, active, disabled }: BlockStyleProps) {
  return (
    <Select
      value={active}
      onValueChange={(value: string | null) => {
        const option = BLOCK_STYLE_OPTIONS.find((option) => option.value === value)
        if (option !== undefined) {
          applyBlockStyle(editor, option.value)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="h-8 min-w-30" aria-label="段落样式">
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

export function BlockStyleButtons({ editor, active, disabled }: BlockStyleProps) {
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
