import { describe, expect, it } from 'vitest'

import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { buildAuditFilterFields, type AuditLogFilterFieldKey } from '@/ui/admin/audit/filter-fields'
import { COMMENT_FILTER_FIELDS } from '@/ui/admin/comments/filter-fields'
import { buildMyCommentFilterFields } from '@/ui/admin/my/filter-fields'
import {
  DateSingleFilterEditor,
  formatDateInput,
  parseDateInput,
} from '@/ui/admin/shared/filter-bar/date-single-editor'
import { TextFilterEditor } from '@/ui/admin/shared/filter-bar/editors'
import { FilterPillBar } from '@/ui/admin/shared/filter-bar/FilterPillBar'
import { SearchableOptionList } from '@/ui/admin/shared/filter-bar/option-list'
import { FilterPill } from '@/ui/admin/shared/filter-bar/pill'

// SSR snapshots for the shared filter-pill chrome. Popover / combobox
// contents mount through portals that Base UI does not emit during
// synchronous SSR, so the assertions target the trigger chrome and the
// standalone list/editor leaves rendered directly.

const AUDIT_ACTORS = [
  { actorId: 'user-1', actorName: '雨帆', email: 'admin@example.com' },
  { actorId: 'user-2', actorName: '访客甲', email: 'guest@example.com' },
]

const NOOP_HANDLERS = {
  onAddFilter: () => {},
  onRemoveFilter: () => {},
  onClearFilters: () => {},
}

describe('snapshot: FilterPillBar', () => {
  it('renders only the bare "筛选" trigger when no filters are active', () => {
    const html = stableHtml(
      renderToHtml(
        <FilterPillBar fields={buildAuditFilterFields(AUDIT_ACTORS)} filters={[]} search={{}} {...NOOP_HANDLERS} />,
      ),
    )
    expect(html).toContain('筛选')
    expect(html).not.toContain('添加筛选')
    expect(html).not.toContain('清除')
  })

  it('renders audit pills (options / freetext / date-range), 添加筛选 and 清除', () => {
    const filters: ActiveFilter<AuditLogFilterFieldKey>[] = [
      { field: 'action', value: 'login', label: '登录' },
      { field: 'resourceType', value: 'post', label: '文章' },
      { field: 'ip', value: '203.0.113', label: 'IP' },
      { field: 'date', value: JSON.stringify({ from: '2024-01-01', to: '' }), label: '自 2024-01-01' },
    ]
    const html = stableHtml(
      renderToHtml(
        <FilterPillBar
          fields={buildAuditFilterFields(AUDIT_ACTORS)}
          filters={filters}
          search={{}}
          {...NOOP_HANDLERS}
        />,
      ),
    )
    // Field labels from the specs.
    expect(html).toContain('操作类型')
    expect(html).toContain('资源类型')
    expect(html).toContain('IP')
    expect(html).toContain('时间')
    // Resolved option labels on the pill triggers.
    expect(html).toContain('登录')
    expect(html).toContain('文章')
    // The freetext editor renders its raw value into the input.
    expect(html).toContain('203.0.113')
    // The date-range picker trigger renders the range label.
    expect(html).toContain('2024-01-01 起')
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
  })

  it('renders the comments status pill and the text pill editor', () => {
    const filters: ActiveFilter<'status' | 'text'>[] = [
      { field: 'status', value: 'pending', label: '待审核' },
      { field: 'text', value: JSON.stringify({ op: 'contains', value: 'hello' }), label: '包含「hello」' },
    ]
    const html = stableHtml(
      renderToHtml(<FilterPillBar fields={COMMENT_FILTER_FIELDS} filters={filters} search={{}} {...NOOP_HANDLERS} />),
    )
    expect(html).toContain('状态')
    expect(html).toContain('待审核')
    expect(html).toContain('内容')
    expect(html).toContain('value="hello"')
  })

  it('falls back to the raw key as the pill label for an unknown field', () => {
    const html = stableHtml(
      renderToHtml(
        <FilterPill
          field={undefined}
          filter={{ field: 'bogus' as never, value: 'x', label: 'x' }}
          search={{}}
          onRemove={() => {}}
          onValueChange={() => {}}
        />,
      ),
    )
    expect(html).toContain('bogus')
  })
})

describe('snapshot: SearchableOptionList', () => {
  it('renders the actor rows through renderOption (icon + truncated label)', () => {
    const actorField = buildAuditFilterFields(AUDIT_ACTORS).find((f) => f.key === 'actor')
    if (actorField?.kind !== 'options') {
      throw new Error('actor field must be an options field')
    }
    const html = stableHtml(
      renderToHtml(
        <SearchableOptionList
          options={actorField.options}
          selectedValue="user-1"
          onSelect={() => {}}
          placeholder={actorField.searchPlaceholder}
          emptyMessage={actorField.searchEmptyMessage}
          renderOption={actorField.renderOption}
        />,
      ),
    )
    expect(html).toContain('placeholder="搜索邮箱、姓名或 ID"')
    expect(html).toContain('admin@example.com')
    expect(html).toContain('guest@example.com')
    // The selected row carries the accent background.
    expect(html).toContain('bg-accent text-accent-foreground')
  })

  it('renders the empty message when the local filter matches nothing', () => {
    const actionField = buildAuditFilterFields([]).find((f) => f.key === 'action')
    if (actionField?.kind !== 'options') {
      throw new Error('action field must be an options field')
    }
    const html = stableHtml(
      renderToHtml(<SearchableOptionList options={[]} onSelect={() => {}} emptyMessage="无匹配操作人" />),
    )
    expect(html).toContain('无匹配操作人')
  })
})

// --- DateSingleFilterEditor (+ pure helpers), moved from the comments suite ---

describe('DateSingleFilterEditor helpers', () => {
  it('parseDateInput returns undefined for empty input', () => {
    expect(parseDateInput('')).toBeUndefined()
  })

  it('parseDateInput returns undefined for malformed input', () => {
    expect(parseDateInput('not-a-date')).toBeUndefined()
    expect(parseDateInput('2024-13-40')).toBeUndefined()
    expect(parseDateInput('2024/03/12')).toBeUndefined()
  })

  it('parseDateInput parses a valid yyyy-mm-dd string', () => {
    const parsed = parseDateInput('2024-03-12')
    expect(parsed).toBeInstanceOf(Date)
    expect(parsed!.getFullYear()).toBe(2024)
    expect(parsed!.getMonth()).toBe(2) // March
    expect(parsed!.getDate()).toBe(12)
  })

  it('formatDateInput round-trips a parsed date', () => {
    const iso = '2024-03-12'
    expect(formatDateInput(parseDateInput(iso)!)).toBe(iso)
  })
})

describe('snapshot: DateSingleFilterEditor', () => {
  it('renders the date input with placeholder and current operator', () => {
    const html = stableHtml(
      renderInRouter(<DateSingleFilterEditor value={{ date: '2024-03-12', op: 'is-or-less' }} onChange={() => {}} />),
    )
    expect(html).toContain('placeholder="YYYY-MM-DD"')
    expect(html).toContain('aria-label="日期"')
    expect(html).toContain('aria-label="打开日历"')
    // The committed value should appear as the input value.
    expect(html).toContain('value="2024-03-12"')
  })

  it('renders with no initial value', () => {
    const html = stableHtml(renderInRouter(<DateSingleFilterEditor value={null} onChange={() => {}} />))
    expect(html).toContain('placeholder="YYYY-MM-DD"')
  })
})

// --- TextFilterEditor, moved from the comments suite ---

describe('snapshot: TextFilterEditor', () => {
  const commentsTextField = COMMENT_FILTER_FIELDS.find((f) => f.key === 'text')
  const myTextField = buildMyCommentFilterFields([]).find((f) => f.key === 'text')

  it('renders the text input with placeholder and the operator trigger', () => {
    if (commentsTextField?.kind !== 'text') {
      throw new Error('comments text field must be a text field')
    }
    const html = stableHtml(
      renderInRouter(
        <TextFilterEditor field={commentsTextField} value={{ op: 'contains', value: 'hello' }} onChange={() => {}} />,
      ),
    )
    expect(html).toContain('aria-label="搜索评论内容"')
    expect(html).toContain('placeholder="搜索评论内容…"')
    expect(html).toContain('value="hello"')
    // With more than one operator the trigger is shown.
    expect(html).toContain('包含')
  })

  it('hides the operator trigger when the field declares a single operator', () => {
    if (myTextField?.kind !== 'text') {
      throw new Error('my text field must be a text field')
    }
    const html = stableHtml(
      renderInRouter(
        <TextFilterEditor field={myTextField} value={{ op: 'contains', value: '' }} onChange={() => {}} />,
      ),
    )
    expect(html).toContain('aria-label="搜索评论内容"')
    // Single operator → no dropdown trigger markup.
    expect(html).not.toMatch(/<button[^>]*>\s*包含/u)
  })
})
