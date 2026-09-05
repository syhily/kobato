import type { LexicalCommand } from 'lexical'

import type {
  GifSettings,
  LibrarySettings,
  SnippetItem,
  SnippetSettings,
} from '@/context/InklingHostIntegrationContext'

import SnippetCardIcon from '@/assets/icons/inkling-card-type-snippet.svg?react'
import { INSERT_SNIPPET_COMMAND } from '@/nodes/cards/card-commands'

interface MenuItemBase {
  nodeType?: string
  label: string
  /** labels-table stem for menu-build-time resolution (`menu.${labelKey}.label`
   * / `.desc`) — carried from the card declaration; absent on snippet items and
   * ad-hoc menu data, which render their `label` as-is. */
  labelKey?: string
  desc?: string
  Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  insertCommand?: LexicalCommand<unknown>
  matches?: ((query: string, label: string) => boolean) | string[]
  priority?: number
  shortcut?: string
  isHidden?: (args: { config: MenuBuildConfig | undefined }) => boolean
  section?: string
  // closed discriminant: menu items are cards (the default) or snippets —
  // CardMenu renders anything else as null, so a typo must not compile
  type?: 'card' | 'snippet'
  onRemove?: () => void
  queryParams?: string[]
  dataTestId?: string
  name?: string
  icon?: string
  customContent?: React.ReactNode
  hidden?: boolean
  disabled?: boolean
}

export interface MenuItem extends MenuItemBase {
  insertParams?: Record<string, unknown> | (() => Record<string, unknown>)
}

/** The menu data one card contributes — historically the node class's static
 * `cardMenu`; now declaration-derived data (see `getEditorCardNodes`). The
 * card declarations normalize menus to arrays; a bare object is still
 * tolerated as a single entry — the shape is part of the buildCardMenu
 * contract (pinned by test/unit/buildCardMenu.test.ts). */
export type CardMenu = MenuItem | MenuItem[]

/** What buildCardMenu reads from each registered card: its menu entries.
 * Menu-less cards (CodeBlock is the only one) carry no `cardMenu` and
 * contribute no items. */
export interface CardMenuSource {
  cardMenu?: CardMenu
}

/** A `MenuItem` after `buildCardMenu` has resolved function-valued `insertParams`
 * against the host config — consumers always see plain data. */
export interface ResolvedMenuItem extends MenuItemBase {
  insertParams?: Record<string, unknown>
}

/**
 * What the menu build reads from the host config — the FLAT subset of
 * `CardConfig`'s feature slices the declarations' `isHidden` gates and the
 * snippet list consume. Typed as this closed subset (never the whole
 * `CardConfig`), so a host menu entry cannot smuggle a slice the build does
 * not read, and the caller composes exactly these keys.
 */
export interface MenuBuildConfig {
  /** GifSettings keys — the gif menu entry's hide gate. */
  tenor?: GifSettings['tenor']
  klipy?: GifSettings['klipy']
  /** SnippetSettings keys — the snippets section. */
  snippets?: SnippetSettings['snippets']
  deleteSnippet?: SnippetSettings['deleteSnippet']
  /** LibrarySettings key — the image-library entry's hide gate. */
  imageLibrary?: LibrarySettings['imageLibrary']
}

export interface BuildCardMenuConfig {
  config?: MenuBuildConfig
}

/** Label resolver injected at menu-build time:
 * receives a labels-table key and the entry's declared English fallback. */
export type ResolveMenuLabel = (key: string, fallback: string) => string

// Section-name resolution: only the two built-in section names go through the
// labels table; a custom section string (host menu data) renders as-is.
const SECTION_LABEL_KEYS: Record<string, string> = {
  Primary: 'menu.section.primary',
  Snippets: 'menu.section.snippets',
}

/** One ordered menu section — the menu's primary view: CardMenu renders
 * sections directly, and `BuildCardMenuResult.items` is derived from them. */
export interface MenuSection {
  label: string
  items: ResolvedMenuItem[]
}

export interface BuildCardMenuResult {
  /** Sections in render order (Primary first), each sorted by priority. */
  sections: MenuSection[]
  /** Every resolved item in render order — `items[i]` is exactly what CardMenu
   * renders with `data-inkling-cardmenu-idx="i"`, so keyboard selection reads
   * the list instead of scraping the DOM. Derived from the final sorted
   * `sections` and sharing item identity with them, so the two views can't
   * drift. */
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
    // items hidden based on missing config (e.g. GIF provider API key)
    if (item.isHidden?.({ config })) {
      return
    }

    // labels resolve at build time (C7): the declaration's English text is the
    // fallback, so the default path (no resolver) is byte-identical. Function-
    // form `matches` receives the RESOLVED label; array-form `matches` stays
    // as declared (English aliases).
    const label = item.labelKey ? (resolveLabel?.(`menu.${item.labelKey}.label`, item.label) ?? item.label) : item.label

    const matches =
      typeof item.matches === 'function'
        ? item.matches(lowerQuery ?? '', label)
        : item.matches?.find((match) => match.startsWith(lowerQuery ?? ''))

    if (lowerQuery && !matches) {
      return
    }

    // resolve function-valued insertParams against the host config (e.g.
    // Header's version stamp) so the menu always carries plain data
    const resolvedItem: ResolvedMenuItem = {
      ...item,
      label,
      insertParams: typeof item.insertParams === 'function' ? item.insertParams() : item.insertParams,
    }
    if (resolvedItem.insertParams === undefined) {
      // the spread above always writes the key; the pre-resolution shape only
      // carries insertParams when the declaration set it (item deep-equality
      // in test/unit/buildCardMenu.test.ts pins key absence)
      delete resolvedItem.insertParams
    }
    if (resolvedItem.desc !== undefined && item.labelKey) {
      resolvedItem.desc = resolveLabel?.(`menu.${item.labelKey}.desc`, resolvedItem.desc) ?? resolvedItem.desc
    }

    // sections group by the DECLARED name so a localized label can't fork the
    // grouping or break the primary-first sort below; the label resolves at
    // the sections-mapping stage
    const section = resolvedItem.section || 'Primary'

    const sectionItems = menu.get(section) ?? []
    sectionItems.push(resolvedItem)
    menu.set(section, sectionItems)
  }

  for (const [nodeType, source] of nodes) {
    // menu-less cards (CodeBlock is the only one) contribute no items
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

  // sort each menu section by priority
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
          } else {
            return a.priority - b.priority
          }
        }),
      ]
    }),
  )

  // sort primary section to always display first
  menu = new Map(
    [...menu.entries()].sort((a, b) => {
      if (a[0] === 'Primary') {
        return -1
      } else {
        return 1
      }
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
