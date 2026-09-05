import type { CardMenuSource } from '@/nodes/cards/card-menu-build'

import TableCardIcon from '@/assets/icons/inkling-card-type-table.svg?react'
import { INSERT_TABLE_COMMAND } from '@/plugins/behaviour/table'

/**
 * The table slash/plus menu entry as a pseudo `CardMenuSource` (the snippet
 * precedent in `@/nodes/cards/card-menu-build`): the table family is not a card, so
 * the entry never joins CARD_DECLARATIONS — `useCardMenu` merges it into
 * buildCardMenu's nodes parameter on editors that register TableNode. The
 * key is the family's node type, same as the card entries.
 */
export const TABLE_MENU_SOURCE: [string, CardMenuSource] = [
  'table',
  {
    cardMenu: [
      {
        label: 'Table',
        labelKey: 'table',
        desc: 'Insert a table',
        Icon: TableCardIcon,
        insertCommand: INSERT_TABLE_COMMAND,
        matches: ['table', 'grid'],
        priority: 3,
        shortcut: '/table',
      },
    ],
  },
]
