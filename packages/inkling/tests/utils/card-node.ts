import type { CardSpecFieldMap } from '@kobato/inkling-internal/nodes/base/card-specs'
import type { GeneratedDecoratorNodeBase } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import type { codeBlockDeclaration } from '@kobato/inkling-internal/nodes/cards/codeblock.declaration'
import type { LexicalNode } from 'lexical'

export type CardNode = LexicalNode &
  GeneratedDecoratorNodeBase & {
    isEmpty?(): boolean
    __openInEditMode?: CardSpecFieldMap<typeof codeBlockDeclaration>['__openInEditMode']
    clearOpenInEditMode?(): void
  }
