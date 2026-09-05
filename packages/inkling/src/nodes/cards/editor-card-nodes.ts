import type { LexicalEditor } from 'lexical'

import type { CardUploadType } from '@/nodes/cards/card-declaration'
import type { CardMenuSource, MenuItem } from '@/nodes/cards/card-menu-build'

import { resolveAllCardFacts } from '@/nodes/cards/card-facts'
import { resolveCardMenuEntries } from '@/nodes/cards/card-menus'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

/**
 * One registered card as declaration-backed data: the menu entries (resolved
 * through the one menu projection in `@/nodes/cards/card-menus`, shared by
 * built-in declarations and host specs alike) and the upload-claiming key,
 * keyed by node type. Consumers take what they need — `buildCardMenu` skips
 * menu-less entries (CodeBlock), `DragDropPastePlugin` reads `uploadType`.
 */
export interface EditorCardNode extends CardMenuSource {
  /** the declaration's menu entries resolved through `resolveCardMenuEntries` — always
   * normalized to an array; undefined for menu-less cards (CodeBlock) */
  cardMenu: MenuItem[] | undefined
  uploadType?: CardUploadType
}

/**
 * The editor's registered cards (CONTEXT.md: "card declaration"). The
 * declarations are the single per-card source of truth, so the only genuinely
 * editor-specific fact left is WHICH node types are registered — read as the
 * keys of the editor's registered-node map (the `lexical-internals`
 * accessor) and intersected with `CARD_DECLARATIONS`. This replaces the
 * historical recovery that walked the registered-node map and cast each
 * class's static side (`inkling-node-class`); the declaration's assembled
 * node class is deliberately not recovered here — the wrapper registry stays
 * unimported, pinned by the layering guard
 * (test/unit/nodes/card-layering-imports.test.ts).
 */
export function getEditorCardNodes(editor: LexicalEditor): [string, EditorCardNode][] {
  return getRegisteredCardNodes(new Set(getRegisteredNodeMap(editor).keys()))
}

/**
 * The pure core of `getEditorCardNodes`: the merged card facts
 * (`@/nodes/cards/card-facts` — built-in declarations in declaration order,
 * which reproduces the editor's card registration order, then host cards in
 * their registration order) filtered to a set of registered node types.
 * Testable directly with a fake registered-type set, no editor mock needed.
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
