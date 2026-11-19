import type { CardIconId, CardMenuEntrySpec } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { CardFacts } from '@kobato/inkling-internal/nodes/cards/card-facts'
import type { MenuItem } from '@kobato/inkling-internal/nodes/cards/card-menu-build'
import type { HostCardMenuEntrySpec } from '@kobato/inkling-internal/nodes/cards/host-card-registry'

import AudioCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-audio.svg?react'
import BookmarkCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-bookmark.svg?react'
import ButtonCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-button.svg?react'
import CalloutCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-callout.svg?react'
import DividerCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-divider.svg?react'
import FileCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-file.svg?react'
import GalleryCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-gallery.svg?react'
import CodeBlockIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-gen-embed.svg?react'
import GIFIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-gif.svg?react'
import HeaderCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-header.svg?react'
import HtmlCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-html.svg?react'
import ImageCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-image.svg?react'
import MathCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-math.svg?react'
import ToggleIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-toggle.svg?react'
import VideoCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-video.svg?react'
import { resolveCardMenuCommand } from '@kobato/inkling-internal/nodes/cards/card-commands'
import { resolveCardFacts } from '@kobato/inkling-internal/nodes/cards/card-facts'

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

export function resolveCardIcon(id: CardIconId): NonNullable<MenuItem['Icon']> {
  return CARD_ICONS[id]
}
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
export function resolveCardMenuEntries(facts: CardFacts): MenuItem[] | undefined {
  const menu =
    facts.source === 'builtin'
      ? 'menu' in facts.declaration
        ? facts.declaration.menu
        : undefined
      : facts.host.spec.menu
  return menu === undefined ? undefined : projectMenuEntries(facts.nodeType, menu)
}

export function resolveCardDragIcon(facts: CardFacts): MenuItem['Icon'] {
  const raw =
    facts.source === 'builtin'
      ? (('dragIcon' in facts.declaration ? facts.declaration.dragIcon : undefined) ??
        ('menu' in facts.declaration ? facts.declaration.menu?.[0]?.icon : undefined))
      : (facts.host.spec.dragIcon ?? facts.host.spec.menu?.[0]?.icon)
  return raw === undefined ? undefined : typeof raw === 'string' ? resolveCardIcon(raw) : raw
}

export function getCardDragIcon(nodeType: string): MenuItem['Icon'] {
  const facts = resolveCardFacts(nodeType)
  return facts === undefined ? undefined : resolveCardDragIcon(facts)
}
