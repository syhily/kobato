import type { SettingsNavGroup } from '@kobato/shared/config/display'
import type { SettingsSection } from '@kobato/shared/config/sections'

import { NAV_GROUP_LABEL } from '@kobato/shared/config/display'
import { useScrollSpyContext, useScrollSpyNav } from '@kobato/ui/admin/settings/shell/useSettingsScrollSpy'
import { useSettingsSearch } from '@kobato/ui/admin/settings/shell/useSettingsSearch'
import { cn } from '@kobato/ui/lib/cn'
import {
  Archive,
  AtSign,
  BarChart3,
  Database,
  FileText,
  Globe,
  HardDrive,
  Mail,
  Mails,
  MessageSquare,
  Navigation,
  PanelLeft,
  Search,
  SearchCode,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Type,
} from 'lucide-react'

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings,
  HardDrive,
  Type,
  FileText,
  PanelLeft,
  MessageSquare,
  AtSign,
  Search,
  Navigation,
  Share2,
  Mail,
  Mails,
  SearchCode,
  Database,
  Globe,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Archive,
  BarChart3,
}

interface SettingsNavItemProps {
  id: string
  label: string
  icon: string
  keywords: string[]
}

function SettingsNavItem({ id, label, icon, keywords }: SettingsNavItemProps) {
  const { ref, props } = useScrollSpyNav(id)
  const { currentSection, scrollToSection } = useScrollSpyContext()
  const { checkVisible } = useSettingsSearch()
  const isCurrent = currentSection === id
  const isVisible = checkVisible(keywords)
  const Icon = ICON_MAP[icon]

  if (!isVisible) {
    return null
  }

  return (
    <li>
      <button
        ref={(node) => {
          ref.current = node
        }}
        type="button"
        onClick={() => scrollToSection(id)}
        className={cn(
          'mt-px flex h-9 w-full cursor-pointer items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-hidden',
          isCurrent ? 'bg-foreground/10 text-foreground' : 'text-foreground/70 hover:bg-foreground/5',
        )}
        {...props}
      >
        {Icon ? <Icon className="mr-[7px] size-4 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </button>
    </li>
  )
}

interface NavGroupProps {
  group: SettingsNavGroup
  items: Array<{ id: SettingsSection; label: string; icon: string; keywords: string[] }>
}

function NavGroup({ group, items }: NavGroupProps) {
  const { checkVisible } = useSettingsSearch()
  const visibleItems = items.filter((item) => checkVisible(item.keywords))

  if (!visibleItems.length) {
    return null
  }

  return (
    <>
      <h2 className="mb-4 ml-2 text-base font-semibold tracking-normal text-foreground">{NAV_GROUP_LABEL[group]}</h2>
      <ul className="-mt-1 mb-7">
        {visibleItems.map((item) => (
          <SettingsNavItem key={item.id} id={item.id} label={item.label} icon={item.icon} keywords={item.keywords} />
        ))}
      </ul>
      <hr className="mx-2 mb-7 border-border" />
    </>
  )
}

interface SettingsNavProps {
  items: Array<{
    id: SettingsSection
    label: string
    icon: string
    group: SettingsNavGroup
    keywords: string[]
  }>
}

export function SettingsNav({ items }: SettingsNavProps) {
  const { noResult } = useSettingsSearch()

  const groups = items.reduce<Record<SettingsNavGroup, typeof items>>(
    (acc, item) => {
      if (!acc[item.group]) {
        acc[item.group] = []
      }
      acc[item.group].push(item)
      return acc
    },
    { site: [], content: [], service: [], system: [] },
  )

  const groupOrder: SettingsNavGroup[] = ['site', 'content', 'service', 'system']

  return (
    <>
      {noResult && <div className="px-3 py-2 text-sm text-muted-foreground">未找到匹配的设置</div>}
      {groupOrder.map((group) =>
        groups[group]?.length ? <NavGroup key={group} group={group} items={groups[group]} /> : null,
      )}
    </>
  )
}
