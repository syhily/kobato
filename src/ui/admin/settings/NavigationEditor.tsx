import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

const VERTICAL_AXIS_ONLY = [restrictToVerticalAxis]

import type { SocialNetwork } from '@/shared/config/socials'
import type { FooterNavItem, NavigationSettings, SocialItem } from '@/shared/config/types'

import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS } from '@/shared/config/socials'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import { Field, FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

interface NavigationEditorProps {
  navigation: NavigationSettings
  socials: SocialItem[]
}

interface SideNavRow {
  clientId: string
  text: string
  link: string
  newTab: boolean
}

interface FooterNavItemRowState extends FooterNavItem {
  clientId: string
}

const TYPE_LABELS: Record<FooterNavItem['type'], string> = {
  social: '社交链接',
  themeToggle: '主题切换',
  search: '搜索',
}

// Runtime guards for the Select-option strings. The `<Select>` emits the
// literal `value` of the chosen `<SelectItem>`, but its callback is typed
// `(value: string) => void` — so narrowing back to the union needs a guard,
// not a cast.
const FOOTER_NAV_TYPE_SET: ReadonlySet<string> = new Set(['social', 'themeToggle', 'search'])
const SOCIAL_NETWORK_SET: ReadonlySet<string> = new Set(SOCIAL_NETWORKS)

function isFooterNavType(value: string): value is FooterNavItem['type'] {
  return FOOTER_NAV_TYPE_SET.has(value)
}

function isSocialNetwork(value: string): value is SocialNetwork {
  return SOCIAL_NETWORK_SET.has(value)
}

function asFooterNavType(value: string | null): FooterNavItem['type'] {
  return value !== null && isFooterNavType(value) ? value : 'social'
}

function asSocialNetwork(value: string | null): SocialNetwork {
  return value !== null && isSocialNetwork(value) ? value : 'github'
}

// Side Navigation Card

function SortableSideNavRow({
  field,
  index,
  form,
  onRemove,
}: {
  field: SideNavRow
  index: number
  form: ReturnType<typeof useSettingsCard<NavigationSettings, { sideNavRows: SideNavRow[] }>>['form']
  onRemove: (index: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.clientId,
  })
  const { 'aria-describedby': _, ...dragAttributes } = attributes
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <button
        type="button"
        {...dragAttributes}
        {...listeners}
        className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
        <div className="flex flex-col gap-1 sm:flex-1">
          <Label htmlFor={`nav-text-${index}`}>显示文本</Label>
          <Input id={`nav-text-${index}`} maxLength={40} {...form.register(`sideNavRows.${index}.text`)} />
        </div>
        <div className="flex flex-col gap-1 sm:flex-1">
          <Label htmlFor={`nav-link-${index}`}>链接</Label>
          <Input
            id={`nav-link-${index}`}
            maxLength={200}
            placeholder="/about 或 https://example.com"
            {...form.register(`sideNavRows.${index}.link`)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Field orientation="horizontal" className="w-fit">
            <Controller
              control={form.control}
              name={`sideNavRows.${index}.newTab` as const}
              render={({ field }) => (
                <Checkbox id={`nav-newtab-${index}`} checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <FieldLabel htmlFor={`nav-newtab-${index}`} className="font-normal">
              新窗口
            </FieldLabel>
          </Field>
          <Button
            type="button"
            variant="destructive-soft"
            size="icon"
            onClick={() => onRemove(index)}
            aria-label="删除"
          >
            <Trash2Icon data-icon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function SideNavCard({ navigation }: { navigation: NavigationSettings }) {
  const { form, settingGroupProps } = useSettingsCard<NavigationSettings, { sideNavRows: SideNavRow[] }>({
    section: 'navigation',
    source: navigation,
    toState: (source) => ({
      sideNavRows: source.navigation.sideNav.map((item, i) => ({
        clientId: `sidenav-${i}`,
        text: item.text,
        link: item.link,
        newTab: item.target === '_blank',
      })),
    }),
    fromState: (state) => ({
      navigation: {
        sideNav: state.sideNavRows.map((row) => ({
          text: row.text.trim(),
          link: row.link.trim(),
          ...(row.newTab ? { target: '_blank' } : {}),
        })),
      },
    }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const rows = useFieldArray({ control: form.control, name: 'sideNavRows' })

  function handleSideNavDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = rows.fields.findIndex((i) => i.clientId === active.id)
      const newIndex = rows.fields.findIndex((i) => i.clientId === over.id)
      rows.move(oldIndex, newIndex)
    }
  }

  return (
    <SettingGroup
      title="侧边导航菜单"
      description="侧边栏导航条目。拖拽调整顺序，标题、链接均可修改。最多 20 个。"
      {...settingGroupProps}
    >
      <div className="flex flex-col gap-3">
        {rows.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有任何菜单条目，点下方按钮新增一项。</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSideNavDragEnd}
            modifiers={VERTICAL_AXIS_ONLY}
          >
            <SortableContext items={rows.fields.map((i) => i.clientId)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {rows.fields.map((field, index) => (
                  <SortableSideNavRow
                    key={field.clientId}
                    field={field as SideNavRow}
                    index={index}
                    form={form}
                    onRemove={(i) => rows.remove(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => rows.append({ clientId: crypto.randomUUID(), text: '', link: '/', newTab: false })}
          disabled={rows.fields.length >= 20}
        >
          <PlusIcon data-icon /> 添加菜单项
        </Button>
      </div>
    </SettingGroup>
  )
}

// Footer Navigation Card

function SortableFooterNavRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: FooterNavItemRowState
  index: number
  onUpdate: (idx: number, patch: Partial<FooterNavItem>) => void
  onRemove: (idx: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.clientId,
  })
  const { 'aria-describedby': _, ...dragAttributes } = attributes
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <button
        type="button"
        {...dragAttributes}
        {...listeners}
        className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`footer-item-type-${index}`}>类型</Label>
          <Select
            value={item.type}
            onValueChange={(value) =>
              onUpdate(index, {
                type: asFooterNavType(value),
                network: value === 'social' ? 'github' : undefined,
              })
            }
          >
            <SelectTrigger id={`footer-item-type-${index}`}>
              <SelectValue>
                {(value: string | null) => (value ? (TYPE_LABELS[asFooterNavType(value)] ?? value) : '请选择')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="social">{TYPE_LABELS.social}</SelectItem>
              <SelectItem value="themeToggle">{TYPE_LABELS.themeToggle}</SelectItem>
              <SelectItem value="search">{TYPE_LABELS.search}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {item.type === 'social' && (
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`footer-item-network-${index}`}>平台</Label>
            <Select
              value={item.network}
              onValueChange={(value) => onUpdate(index, { network: asSocialNetwork(value) })}
            >
              <SelectTrigger id={`footer-item-network-${index}`}>
                <SelectValue>
                  {(value: string | null) =>
                    value ? (SOCIAL_NETWORK_META[asSocialNetwork(value)]?.label ?? value) : '请选择'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SOCIAL_NETWORKS.map((network) => (
                  <SelectItem key={network} value={network}>
                    {SOCIAL_NETWORK_META[network].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <Button type="button" variant="destructive-soft" size="icon" onClick={() => onRemove(index)} aria-label="删除">
        <Trash2Icon data-icon />
      </Button>
    </div>
  )
}

function FooterNavCard({ navigation, socials }: { navigation: NavigationSettings; socials: SocialItem[] }) {
  const { form, settingGroupProps } = useSettingsCard<NavigationSettings, { footerNavItems: FooterNavItemRowState[] }>({
    section: 'navigation',
    source: navigation,
    toState: (source) => ({
      footerNavItems: source.navigation.footerNav.map((item, i) => ({
        ...item,
        clientId: `footer-${i}`,
      })),
    }),
    fromState: (state) => ({
      navigation: {
        footerNav: state.footerNavItems.map((item) => ({ type: item.type, network: item.network })),
      },
    }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const rows = useFieldArray({ control: form.control, name: 'footerNavItems' })

  function handleFooterDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = rows.fields.findIndex((i) => i.clientId === active.id)
      const newIndex = rows.fields.findIndex((i) => i.clientId === over.id)
      rows.move(oldIndex, newIndex)
    }
  }

  function updateFooterItem(index: number, patch: Partial<FooterNavItem>) {
    const current = rows.fields[index]
    rows.update(index, { ...current, ...patch } as FooterNavItemRowState)
  }

  const configuredNetworks = new Set(socials.map((s) => s.network))

  return (
    <SettingGroup
      title="底部导航菜单"
      description="页脚中显示的快捷按钮。可选择社交链接、主题切换或搜索。最多 5 项，拖拽可调整顺序。"
      {...settingGroupProps}
    >
      <div className="flex flex-col gap-3">
        {rows.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有任何导航条目，点下方按钮新增一项。</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFooterDragEnd}
            modifiers={VERTICAL_AXIS_ONLY}
          >
            <SortableContext items={rows.fields.map((i) => i.clientId)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {rows.fields.map((item, index) => (
                  <SortableFooterNavRow
                    key={item.clientId}
                    item={item as FooterNavItemRowState}
                    index={index}
                    onUpdate={updateFooterItem}
                    onRemove={(i) => rows.remove(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => rows.append({ type: 'social', network: 'github', clientId: crypto.randomUUID() })}
            disabled={rows.fields.length >= 5}
          >
            <PlusIcon data-icon /> 添加导航项
          </Button>
          {rows.fields.some(
            (item) => item.type === 'social' && item.network && !configuredNetworks.has(item.network),
          ) && <span className="text-sm text-destructive">部分社交链接尚未配置，保存后不会在页脚显示。</span>}
        </div>
      </div>
    </SettingGroup>
  )
}

export function NavigationEditor({ navigation, socials }: NavigationEditorProps) {
  return (
    <div className="flex flex-col gap-5">
      <SideNavCard navigation={navigation} />
      <FooterNavCard navigation={navigation} socials={socials} />
    </div>
  )
}
