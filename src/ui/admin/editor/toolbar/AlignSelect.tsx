import type { Editor } from '@tiptap/core'

import { ALIGN_OPTIONS, getActiveAlign } from '@/ui/admin/editor/toolbar/style-helpers'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

interface AlignSelectProps {
  editor: Editor
  disabled?: boolean
}

export function AlignSelect({ editor, disabled }: AlignSelectProps) {
  const active = getActiveAlign(editor)
  return (
    <Select
      value={active}
      onValueChange={(value: string | null) => {
        if (value === 'left' || value === 'center' || value === 'right') {
          editor.chain().focus().setTextAlign(value).run()
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
