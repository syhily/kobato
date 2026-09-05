import type { CardIconId, CardMenuEntrySpec } from '@/nodes/cards/card-declaration'
import type { CardFacts } from '@/nodes/cards/card-facts'
import type { MenuItem } from '@/nodes/cards/card-menu-build'
import type { HostCardMenuEntrySpec } from '@/nodes/cards/host-card-registry'

import AudioCardIcon from '@/assets/icons/inkling-card-type-audio.svg?react'
import BookmarkCardIcon from '@/assets/icons/inkling-card-type-bookmark.svg?react'
import ButtonCardIcon from '@/assets/icons/inkling-card-type-button.svg?react'
import CalloutCardIcon from '@/assets/icons/inkling-card-type-callout.svg?react'
import DividerCardIcon from '@/assets/icons/inkling-card-type-divider.svg?react'
import FileCardIcon from '@/assets/icons/inkling-card-type-file.svg?react'
import GalleryCardIcon from '@/assets/icons/inkling-card-type-gallery.svg?react'
import CodeBlockIcon from '@/assets/icons/inkling-card-type-gen-embed.svg?react'
import GIFIcon from '@/assets/icons/inkling-card-type-gif.svg?react'
import HeaderCardIcon from '@/assets/icons/inkling-card-type-header.svg?react'
import HtmlCardIcon from '@/assets/icons/inkling-card-type-html.svg?react'
import ImageCardIcon from '@/assets/icons/inkling-card-type-image.svg?react'
import MathCardIcon from '@/assets/icons/inkling-card-type-math.svg?react'
import ToggleIcon from '@/assets/icons/inkling-card-type-toggle.svg?react'
import VideoCardIcon from '@/assets/icons/inkling-card-type-video.svg?react'
import { resolveCardMenuCommand } from '@/nodes/cards/card-commands'
import { resolveCardFacts } from '@/nodes/cards/card-facts'

/**
 * The menu/drag icons the declarations name by `CardIconId`. This is the one
 * React-bearing attachment point for card menu data: every icon is an SVGR
 * component (`*.svg?react`), so the map cannot live in the React-free
 * declaration modules.
 */
const CARD_ICONS = {
  audio: AudioCardIcon,
  bookmark: BookmarkCardIcon,
  button: ButtonCardIcon,
  callout: CalloutCardIcon,
  codeblock: CodeBlockIcon,
  divider: DividerCardIcon,
  file: FileCardIcon,
  gallery: GalleryCardIcon,
  gif: GIFIcon,
  header: HeaderCardIcon,
  html: HtmlCardIcon,
  image: ImageCardIcon,
  math: MathCardIcon,
  toggle: ToggleIcon,
  video: VideoCardIcon,
} satisfies Record<CardIconId, NonNullable<MenuItem['Icon']>>

/**
 * Resolves a menu/drag icon named by `CardIconId` to its SVGR component —
 * the same table the built-in menu projection reads. Exported for
 * `defineCard` (`@/nodes/cards/host-cards`): host menu entries may name a
 * built-in icon by id instead of passing a component.
 */
export function resolveCardIcon(id: CardIconId): NonNullable<MenuItem['Icon']> {
  return CARD_ICONS[id]
}

/**
 * The one menu projection every view shares: a card's menu spec resolved to
 * `MenuItem[]` — the icon (a built-in `CardIconId` or, for host cards, an
 * SVG component directly) becomes the SVGR component and the entry's named
 * `command` (`CardMenuCommand`, or a raw `LexicalCommand` on host entries)
 * becomes its `insertCommand` through `resolveCardMenuCommand`. Built-in
 * declarations and host specs flow through this same function; there is no
 * host-side copy.
 */
function projectMenuEntries(
  nodeType: string,
  menu: readonly (CardMenuEntrySpec | HostCardMenuEntrySpec)[],
): MenuItem[] {
  return menu.map(({ icon, command, ...item }) => ({
    ...item,
    Icon: typeof icon === 'string' ? resolveCardIcon(icon) : icon,
    insertCommand: typeof command === 'string' ? resolveCardMenuCommand(command, nodeType) : command,
  }))
}

/**
 * Resolves a card's slash/plus menu entries from its merged facts — what the
 * hand-written `CARD_MENUS` map keyed by node type used to hold. CodeBlock
 * declares no menu and resolves none. Consumed by `getCardDragIcon` and
 * `getEditorCardNodes`.
 */
export function resolveCardMenuEntries(facts: CardFacts): MenuItem[] | undefined {
  // `in` narrows the built-in union to the declarations carrying the
  // optional menu entry
  const menu =
    facts.source === 'builtin'
      ? 'menu' in facts.declaration
        ? facts.declaration.menu
        : undefined
      : facts.host.spec.menu
  return menu === undefined ? undefined : projectMenuEntries(facts.nodeType, menu)
}

/**
 * Resolves a card's drag-preview icon from its merged facts — what the
 * thirteen `getIcon()` copies returned. Menu-bearing cards use their first
 * menu entry's icon (Image's two-entry menu keeps the Image icon, not the
 * GIF one); user-draggable menu-less cards name theirs explicitly as the
 * spec's `dragIcon` (CodeBlock). The menu-less footnote definition resolves
 * no icon — it lives in the doc-end run and the run-invariant transform
 * re-parks it anyway.
 */
export function resolveCardDragIcon(facts: CardFacts): MenuItem['Icon'] {
  const raw =
    facts.source === 'builtin'
      ? (('dragIcon' in facts.declaration ? facts.declaration.dragIcon : undefined) ??
        ('menu' in facts.declaration ? facts.declaration.menu?.[0]?.icon : undefined))
      : (facts.host.spec.dragIcon ?? facts.host.spec.menu?.[0]?.icon)
  return raw === undefined ? undefined : typeof raw === 'string' ? resolveCardIcon(raw) : raw
}

/**
 * Resolves a card's drag-preview icon by node type. The built-in-first /
 * host-fallback merge lives in `@/nodes/cards/card-facts`.
 */
export function getCardDragIcon(nodeType: string): MenuItem['Icon'] {
  const facts = resolveCardFacts(nodeType)
  return facts === undefined ? undefined : resolveCardDragIcon(facts)
}
