import { FilterIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { RoleFilter, SortOrder } from '@/ui/admin/users/useUsersFilters'

import { LabelledCheckbox } from '@/ui/admin/shared/LabelledCheckbox'
import { Button } from '@/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Separator } from '@/ui/components/separator'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

const ROLE_OPTIONS: { value: RoleFilter; labelId: UiMessageId }[] = [
  { value: 'all', labelId: 'admin.users.role.all' },
  { value: 'admin', labelId: 'common.role.admin' },
  { value: 'author', labelId: 'common.role.author' },
  { value: 'visitor', labelId: 'common.role.visitor' },
  { value: 'normal', labelId: 'admin.users.role.normal' },
]

const SORT_OPTIONS: { value: SortOrder; labelId: UiMessageId }[] = [
  { value: 'recent', labelId: 'admin.users.sort.recent' },
  { value: 'commentCount', labelId: 'admin.users.sort.commentCount' },
]

interface UsersToolbarProps {
  role: RoleFilter
  sortBy: SortOrder
  includeDeleted: boolean
  onRoleChange: (value: RoleFilter) => void
  onSortByChange: (value: SortOrder) => void
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
  const { t } = useI18n()
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
              className={cn(hasFilters && 'border-foreground/30 bg-secondary')}
            >
              <FilterIcon /> {t('admin.users.toolbar.filter')}
            </Button>
          }
        />
        <PopoverContent className="w-64" align="end">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('admin.users.toolbar.role')}
              </div>
              <div className="flex flex-wrap gap-1">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'rounded-xl px-2.5 py-1 text-sm transition-colors',
                      role === option.value
                        ? 'bg-secondary font-medium text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    onClick={() => onRoleChange(option.value)}
                  >
                    {t(option.labelId)}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('admin.users.toolbar.sort')}
              </div>
              <Select
                items={SORT_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) }))}
                value={sortBy}
                onValueChange={(value) => onSortByChange((value ?? 'recent') as SortOrder)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {t(item.labelId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <LabelledCheckbox
              id="users-include-deleted"
              label={t('admin.users.includeDeleted')}
              checked={includeDeleted}
              onCheckedChange={onIncludeDeletedChange}
            />

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
                  <XIcon /> {t('admin.users.clearFilters')}
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
