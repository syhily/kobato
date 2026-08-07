import { useQuery } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

export interface CategoryFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function CategoryField({ value, onChange, disabled }: CategoryFieldProps) {
  const categoriesQuery = useQuery(orpcQuery.admin.categories.list.queryOptions({ input: {} }))
  const categories = categoriesQuery.data?.categories ?? []

  return (
    <div className="grid gap-2">
      <Label htmlFor="post-category">分类</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} disabled={disabled}>
        <SelectTrigger id="post-category" className="w-full">
          {/* Base UI's `<Select.Value>` renders the raw `value` by default —
              resolve the category name here, mirroring `AlignSelect`. */}
          <SelectValue placeholder="— 无分类 —">
            {(selected) => {
              const match = categories.find((cat) => cat.id === selected)
              return match ? match.name : '— 无分类 —'
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">— 无分类 —</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">选择文章所属分类。若列表为空，请先在分类管理中创建。</p>
    </div>
  )
}
