import type { CreateEditorArgs } from 'lexical'

import { DEFAULT_BASE_NODES } from '@kobato/inkling-internal/nodes/base'
import { INKLING_TABLE_NODES } from '@kobato/inkling-internal/nodes/table/TableNodes'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'

/**
 * The complete node set shared by the default HTML importer
 * (`htmlToLexical`) and the headless render path (`lexicalStateToHtml`), so
 * default output from one is always valid default input to the other.
 *
 * Order matters: the five basic Lexical nodes are registered first so the
 * extended-node replacement descriptors in DEFAULT_BASE_NODES land after the
 * classes they replace. The table element family appends last — it carries
 * no replacement descriptors, so nothing it follows can shadow it.
 */
export const DEFAULT_HTML_NODES = [
  HeadingNode,
  LinkNode,
  // typed-URL autolinks serialize as type 'autolink'; parse needs the class
  // registered (imported `<a>` markup still converts to plain LinkNode)
  AutoLinkNode,
  ListItemNode,
  ListNode,
  QuoteNode,

  ...DEFAULT_BASE_NODES,

  ...INKLING_TABLE_NODES,
] satisfies NonNullable<CreateEditorArgs['nodes']>
