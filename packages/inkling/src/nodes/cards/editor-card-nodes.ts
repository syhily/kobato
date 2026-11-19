import type { CardUploadType } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { CardMenuSource, MenuItem } from '@kobato/inkling-internal/nodes/cards/card-menu-build'
import type { LexicalEditor } from 'lexical'

import { resolveAllCardFacts } from '@kobato/inkling-internal/nodes/cards/card-facts'
import { resolveCardMenuEntries } from '@kobato/inkling-internal/nodes/cards/card-menus'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'

export interface EditorCardNode extends CardMenuSource {
  cardMenu: MenuItem[] | undefined
  uploadType?: CardUploadType
}
export function getEditorCardNodes(editor: LexicalEditor): [string, EditorCardNode][] {
  return getRegisteredCardNodes(new Set(getRegisteredNodeMap(editor).keys()))
}

export function getRegisteredCardNodes(registeredNodeTypes: ReadonlySet<string>): [string, EditorCardNode][] {
  return resolveAllCardFacts().flatMap((facts): [string, EditorCardNode][] => {
    if (!registeredNodeTypes.has(facts.nodeType)) {
      return []
    }

    return [
      [
        facts.nodeType,
        {
          cardMenu: resolveCardMenuEntries(facts),
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
