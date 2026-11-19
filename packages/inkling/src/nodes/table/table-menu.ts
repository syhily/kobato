import type { CardMenuSource } from '@kobato/inkling-internal/nodes/cards/card-menu-build'

import TableCardIcon from '@kobato/inkling-internal/assets/icons/inkling-card-type-table.svg?react'
import { INSERT_TABLE_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/table'

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
