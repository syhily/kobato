import { XIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { DERIVED_SLUG_PATTERN } from '@/shared/slug'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'

export interface AliasFieldProps {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

export function AliasField({ values, onChange, disabled }: AliasFieldProps) {
  const [input, setInput] = useState('')

  const addAlias = useCallback(
    (raw: string) => {
      const slug = raw.trim().toLowerCase().replace(/\s+/g, '-')
      if (slug === '' || values.includes(slug)) {
        return
      }
      if (!DERIVED_SLUG_PATTERN.test(slug)) {
        toast.error('别名只能包含小写字母、数字和连字符，且不能以连字符开头或结尾。')
        return
      }
      onChange([...values, slug])
      setInput('')
    },
    [values, onChange],
  )

  const removeAlias = useCallback(
    (slug: string) => {
      onChange(values.filter((v) => v !== slug))
    },
    [values, onChange],
  )

  return (
    <div className="grid gap-2">
      <Label>别名</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((alias) => (
          <Badge key={alias} variant="outline" className="gap-1 pr-1">
            {alias}
            <button
              type="button"
              onClick={() => removeAlias(alias)}
              disabled={disabled}
              className="rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
              aria-label={`移除别名 ${alias}`}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addAlias(input)
            }
          }}
          disabled={disabled}
          placeholder="输入别名 slug，按回车添加"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addAlias(input)}
          disabled={disabled || input.trim() === ''}
        >
          添加
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        别名会生成额外的访问路径 /posts/别名。只能包含小写字母、数字和连字符。
      </p>
    </div>
  )
}
