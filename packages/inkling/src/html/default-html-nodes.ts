import type { CreateEditorArgs } from 'lexical'

import { DEFAULT_BASE_NODES } from '@kobato/inkling-internal/nodes/base'
import { INKLING_TABLE_NODES } from '@kobato/inkling-internal/nodes/table/TableNodes'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'

export const DEFAULT_HTML_NODES = [
  HeadingNode,
  LinkNode,
  AutoLinkNode,
  ListItemNode,
  ListNode,
  QuoteNode,

  ...DEFAULT_BASE_NODES,

  ...INKLING_TABLE_NODES,
] satisfies NonNullable<CreateEditorArgs['nodes']>
