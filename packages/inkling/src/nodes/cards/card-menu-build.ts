import type {
  GifSettings,
  LibrarySettings,
  SnippetItem,
  SnippetSettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { AnyLexicalCommand } from 'lexical'
import type { ComponentType, SVGProps } from 'react'

import SnippetCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-snippet.svg?react'
import { INSERT_SNIPPET_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'

interface MenuItemBase {
  nodeType?: string
  label: string
  labelKey?: string
  desc?: string
  Icon?: ComponentType<SVGProps<SVGSVGElement>>
  insertCommand?: AnyLexicalCommand
  matches?: ((query: string, label: string) => boolean) | string[]
  priority?: number
  shortcut?: string
  isHidden?: (args: { config: MenuBuildConfig | undefined }) => boolean
  section?: string
  type?: 'card' | 'snippet'
  onRemove?: () => void
  queryParams?: readonly string[]
  dataTestId?: string
}

export interface MenuItem extends MenuItemBase {
  insertParams?: Record<string, unknown> | (() => Record<string, unknown>)
}

export type CardMenu = MenuItem | MenuItem[]
export interface CardMenuSource {
  cardMenu?: CardMenu
}

export interface ResolvedMenuItem extends MenuItemBase {
  insertParams?: Record<string, unknown>
}

export type CardMenuInsertParams = Pick<ResolvedMenuItem, 'insertParams' | 'queryParams'>
export interface MenuBuildConfig {
  tenor?: GifSettings['tenor']
  klipy?: GifSettings['klipy']
  snippets?: SnippetSettings['snippets']
  deleteSnippet?: SnippetSettings['deleteSnippet']

  imageLibrary?: LibrarySettings['imageLibrary']
}
export interface BuildCardMenuConfig {
  config?: MenuBuildConfig
}

export type ResolveMenuLabel = (key: string, fallback: string) => string

const SECTION_LABEL_KEYS: Record<string, string> = {
  Primary: 'menu.section.primary',
  Snippets: 'menu.section.snippets',
}

export interface MenuSection {
  label: string
  items: ResolvedMenuItem[]
}

export interface BuildCardMenuResult {
  sections: MenuSection[]

  items: ResolvedMenuItem[]
  maxItemIndex: number
}

export function buildCardMenu(
  nodes: Map<string, CardMenuSource> | Iterable<[string, CardMenuSource]>,
  { query, config, resolveLabel }: { query?: string; config?: MenuBuildConfig; resolveLabel?: ResolveMenuLabel } = {},
): BuildCardMenuResult {
  let menu = new Map<string, ResolvedMenuItem[]>()

  const lowerQuery = query?.toLowerCase()

  function addMenuItem(item: MenuItem): void {
    if (item.isHidden?.({ config })) {
      return
    }
    const label = item.labelKey ? (resolveLabel?.(`menu.${item.labelKey}.label`, item.label) ?? item.label) : item.label
    const matches =
      typeof item.matches === 'function'
        ? item.matches(lowerQuery ?? '', label)
        : item.matches?.find((match) => match.startsWith(lowerQuery ?? ''))

    if (lowerQuery && !matches) {
      return
    }

    const resolvedItem: ResolvedMenuItem = {
      ...item,
      label,
      insertParams: typeof item.insertParams === 'function' ? item.insertParams() : item.insertParams,
    }
    if (resolvedItem.insertParams === undefined) {
      delete resolvedItem.insertParams
    }
    if (resolvedItem.desc !== undefined && item.labelKey) {
      resolvedItem.desc = resolveLabel?.(`menu.${item.labelKey}.desc`, resolvedItem.desc) ?? resolvedItem.desc
    }

    const section = resolvedItem.section || 'Primary'

    const sectionItems = menu.get(section) ?? []
    sectionItems.push(resolvedItem)
    menu.set(section, sectionItems)
  }

  for (const [nodeType, source] of nodes) {
    if (!source.cardMenu) {
      continue
    }
    const cardMenuItems = Array.isArray(source.cardMenu) ? source.cardMenu : [source.cardMenu]
    cardMenuItems.forEach((item) => addMenuItem({ nodeType, ...item }))
  }

  config?.snippets?.forEach((item) => {
    const snippetMenuItem = buildSnippetMenuItem(item, config)
    addMenuItem(snippetMenuItem)
  })

  menu = new Map(
    [...menu.entries()].map(([section, items]) => {
      return [
        section,
        items.sort((a, b) => {
          if (a.priority === b.priority) {
            return 0
          } else if (a.priority === undefined) {
            return 1
          } else if (b.priority === undefined) {
            return -1
          }
          return a.priority - b.priority
        }),
      ]
    }),
  )

  menu = new Map(
    [...menu.entries()].sort((a, b) => {
      if (a[0] === 'Primary') {
        return b[0] === 'Primary' ? 0 : -1
      }
      return b[0] === 'Primary' ? 1 : 0
    }),
  )

  const sections: MenuSection[] = [...menu.entries()].map(([label, sectionItems]) => {
    const sectionLabelKey = SECTION_LABEL_KEYS[label]
    return {
      label: sectionLabelKey ? (resolveLabel?.(sectionLabelKey, label) ?? label) : label,
      items: sectionItems,
    }
  })
  const items = sections.flatMap((section) => section.items)

  return { sections, items, maxItemIndex: items.length - 1 }
}

function buildSnippetMenuItem(data: SnippetItem, config: MenuBuildConfig | undefined): MenuItem {
  const name = data.name.toLowerCase()
  const snippet: MenuItem = {
    type: 'snippet',
    label: data.name,
    Icon: SnippetCardIcon,
    section: 'Snippets',
    matches: (query: string) => name.includes(query) || 'snippets'.includes(query),
    insertCommand: INSERT_SNIPPET_COMMAND,
    insertParams: { name: data.name, value: data.value },
    ...(config?.deleteSnippet && { onRemove: () => void config.deleteSnippet?.(data) }),
  }

  return snippet
}
