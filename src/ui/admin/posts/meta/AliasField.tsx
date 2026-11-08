import { XIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { DERIVED_SLUG_PATTERN } from '@/shared/slug'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface AliasFieldProps {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

export function AliasField({ values, onChange, disabled }: AliasFieldProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')

  const addAlias = useCallback(
    (raw: string) => {
      const slug = raw.trim().toLowerCase().replace(/\s+/g, '-')
      if (slug === '' || values.includes(slug)) {
        return
      }
      if (!DERIVED_SLUG_PATTERN.test(slug)) {
        toast.error(t('admin.posts.meta.aliasInvalid'))
        return
      }
      onChange([...values, slug])
      setInput('')
    },
    [values, onChange, t],
  )

  const removeAlias = useCallback(
    (slug: string) => {
      onChange(values.filter((v) => v !== slug))
    },
    [values, onChange],
  )

  return (
    <div className="grid gap-2">
      <Label>{t('admin.posts.meta.alias')}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((alias) => (
          <Badge key={alias} variant="outline" className="gap-1 pr-1">
            {alias}
            <button
              type="button"
              onClick={() => removeAlias(alias)}
              disabled={disabled}
              className="rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
              aria-label={t('admin.posts.meta.aliasRemoveAria', { alias })}
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
          placeholder={t('admin.posts.meta.aliasPlaceholder')}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addAlias(input)}
          disabled={disabled || input.trim() === ''}
        >
          {t('admin.posts.meta.aliasAdd')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('admin.posts.meta.aliasHint')}</p>
    </div>
  )
}
