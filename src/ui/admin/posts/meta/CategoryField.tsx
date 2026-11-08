import { useQuery } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface CategoryFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function CategoryField({ value, onChange, disabled }: CategoryFieldProps) {
  const { t } = useI18n()
  const categoriesQuery = useQuery(orpcQuery.admin.categories.list.queryOptions({ input: {} }))
  const categories = categoriesQuery.data?.categories ?? []

  return (
    <div className="grid gap-2">
      <Label htmlFor="post-category">{t('admin.posts.meta.category')}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} disabled={disabled}>
        <SelectTrigger id="post-category" className="w-full">
          {/* Base UI's `<Select.Value>` renders the raw `value` by default —
              resolve the category name here, mirroring `AlignSelect`. */}
          <SelectValue placeholder={t('admin.posts.meta.noCategory')}>
            {(selected) => {
              const match = categories.find((cat) => cat.id === selected)
              return match ? match.name : t('admin.posts.meta.noCategory')
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{t('admin.posts.meta.noCategory')}</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('admin.posts.meta.categoryHint')}</p>
    </div>
  )
}
