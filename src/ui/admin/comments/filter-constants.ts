import type { ComponentType, SVGProps } from 'react'

import { CalendarIcon, FileTextIcon, ListChecksIcon, SearchIcon, UserIcon } from 'lucide-react'

import type { FilterFieldKey } from '@/ui/admin/comments/useCommentsController'

export type FieldIcon = ComponentType<SVGProps<SVGSVGElement>>

export const FILTER_FIELDS: { key: FilterFieldKey; label: string; icon: FieldIcon }[] = [
  { key: 'status', label: '状态', icon: ListChecksIcon },
  { key: 'page', label: '文章', icon: FileTextIcon },
  { key: 'author', label: '评论人', icon: UserIcon },
  { key: 'text', label: '内容', icon: SearchIcon },
  { key: 'date', label: '时间', icon: CalendarIcon },
]

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已审核' },
]
