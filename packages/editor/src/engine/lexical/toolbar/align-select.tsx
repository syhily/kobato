import type { LexicalEditor } from 'lexical'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/editor/engine/components/select'
import { applyAlign } from '@kobato/editor/engine/lexical/block-commands'
import { ALIGN_OPTIONS } from '@kobato/editor/engine/toolbar/style-helpers'

// Lexical counterpart of the tiptap `AlignSelect` (compact density).
// The option catalogue is shared with the tiptap engine; the active
// value comes from the toolbar selection state (`left` covers the
// default unset format).

interface AlignSelectProps {
  editor: LexicalEditor
  active: string
  disabled?: boolean
}

export function AlignSelect({ editor, active, disabled }: AlignSelectProps) {
  return (
    <Select
      value={active}
      onValueChange={(value: string | null) => {
        if (value === 'left' || value === 'center' || value === 'right') {
          applyAlign(editor, value)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="h-8 min-w-24" aria-label="对齐方式">
        <SelectValue placeholder="对齐">
          {(value) => {
            const match = ALIGN_OPTIONS.find((option) => option.value === value)
            if (match === undefined) {
              return '对齐'
            }
            return (
              <span className="flex items-center gap-1.5">
                <match.Icon className="h-4 w-4" />
                {match.label}
              </span>
            )
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ALIGN_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <option.Icon className="h-4 w-4" />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
