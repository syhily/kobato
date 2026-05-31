import { FilterIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { RoleFilter, SortOrder } from '@/ui/admin/users/useUsersController'

import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Separator } from '@/ui/components/separator'
import { cn } from '@/ui/lib/cn'

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'admin', label: '管理员' },
  { value: 'author', label: '作者' },
  { value: 'visitor', label: '访客' },
  { value: 'normal', label: '非管理员' },
]

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'recent', label: '最新注册' },
  { value: 'commentCount', label: '评论数（高 → 低）' },
]

interface UsersToolbarProps {
  role: RoleFilter
  sortBy: SortOrder
  pageSize: number
  includeDeleted: boolean
  onRoleChange: (value: RoleFilter) => void
  onSortByChange: (value: SortOrder) => void
  onPageSizeChange: (value: number) => void
  onIncludeDeletedChange: (value: boolean) => void
}

export function UsersToolbar({
  role,
  sortBy,
  includeDeleted,
  onRoleChange,
  onSortByChange,
  onIncludeDeletedChange,
}: UsersToolbarProps) {
  const [open, setOpen] = useState(false)
  const hasFilters = role !== 'all' || includeDeleted

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('border-input', hasFilters && 'border-foreground/30 bg-secondary')}
            >
              <FilterIcon /> 筛选
            </Button>
          }
        />
        <PopoverContent className="w-64" align="end">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">角色</div>
              <div className="flex flex-wrap gap-1">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'rounded-md px-2.5 py-1 text-sm transition-colors',
                      role === option.value
                        ? 'bg-secondary font-medium text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    onClick={() => onRoleChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">排序</div>
              <Select
                items={SORT_OPTIONS}
                value={sortBy}
                onValueChange={(value) => onSortByChange((value ?? 'recent') as SortOrder)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Checkbox
                id="users-include-deleted"
                checked={includeDeleted}
                onCheckedChange={(value) => onIncludeDeletedChange(value === true)}
              />
              <label htmlFor="users-include-deleted" className="text-sm select-none">
                包含已删除用户
              </label>
            </div>

            {hasFilters && (
              <>
                <Separator />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onRoleChange('all')
                    onIncludeDeletedChange(false)
                  }}
                >
                  <XIcon /> 清除筛选
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
