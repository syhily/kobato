import type { LexicalEditor } from 'lexical'

import type { CardUploadType } from '@/inkling/nodes/cards/card-declaration'
import type { CardMenuSource, MenuItem } from '@/inkling/nodes/cards/card-menu-build'

import { resolveAllCardFacts } from '@/inkling/nodes/cards/card-facts'
import { resolveCardMenuEntries } from '@/inkling/nodes/cards/card-menus'
import { getRegisteredNodeMap } from '@/inkling/utils/lexical-internals'

/**
 * One registered card as declaration-backed data: menu entries resolved through the
 * shared menu projection (built-in and host alike) plus the upload-claiming key,
 * keyed by node type.
 */
export interface EditorCardNode extends CardMenuSource {
  /** the declaration's menu entries resolved through `resolveCardMenuEntries`, always
   * normalized to an array; undefined when the declaration carries no `menu` */
  cardMenu: MenuItem[] | undefined
  uploadType?: CardUploadType
}

/**
 * The editor's registered cards: merged card facts filtered to the node types the
 * editor registers, read from the keys of its registered-node map. The assembled
 * node class is deliberately not recovered here — the wrapper registry stays
 * unimported, pinned by `card-layering-imports.test.ts`.
 */
export function getEditorCardNodes(editor: LexicalEditor): [string, EditorCardNode][] {
  return getRegisteredCardNodes(new Set(getRegisteredNodeMap(editor).keys()))
}

/**
 * The pure core of `getEditorCardNodes`: merged card facts (built-in declarations
 * in declaration order, then host cards in registration order) filtered to a set of
 * registered node types. Testable with a fake type set, no editor mock.
 */
export function getRegisteredCardNodes(registeredNodeTypes: ReadonlySet<string>): [string, EditorCardNode][] {
  return resolveAllCardFacts().flatMap((facts): [string, EditorCardNode][] => {
    if (!registeredNodeTypes.has(facts.nodeType)) {
      return []
    }

    return [
      [
        facts.nodeType,
        {
          // both sources flow through the one menu projection
          cardMenu: resolveCardMenuEntries(facts),
          // `in` narrows the built-in union to the declarations carrying the
          // optional upload entry
          uploadType:
            facts.source === 'builtin'
              ? 'uploadType' in facts.declaration
                ? facts.declaration.uploadType
                : undefined
              : facts.host.spec.uploadType,
        },
      ],
    ]
  })
}
