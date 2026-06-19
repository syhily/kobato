import type { EditorState } from 'lexical'

import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useCallback } from 'react'

import type { InklingBlockNode, InklingDocument, InklingFootnoteDefinitionNode } from '@/shared/inkling/schema'
import type { FootnoteDefinitionItem } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

import { removeOrphanFootnoteDefinitions, synchronizeInklingFootnoteIndices } from '@/shared/inkling/footnotes'
import { safeValidateInklingDocument } from '@/shared/inkling/schema'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

interface MergeFootnoteDefinitionsOptions {
  /** Parallel-state footnote definitions, owned by `InklingFootnoteProvider`.
   *  When provided, the editor's prose-only root is merged with these
   *  definitions to reconstruct the persisted document shape. */
  getDefinitions?: () => readonly FootnoteDefinitionItem[]
}

/**
 * Reconstruct the persisted document shape from the editor's prose-only state
 * plus the provider-owned footnote definitions. The editor tree never contains
 * `footnote-definition` blocks (they were stripped at read time); this function
 * appends them at the root tail, then canonicalises indices and drops orphans
 * so the output matches what renderers + migrate-pt expect.
 */
function mergeFootnoteDefinitions(editorState: EditorState, options: MergeFootnoteDefinitionsOptions): InklingDocument {
  const proseDocument = editorStateToInklingDocument(editorState)
  const proseChildren = proseDocument.root.children as InklingBlockNode[]

  const definitions = options.getDefinitions?.() ?? []
  const definitionBlocks: InklingFootnoteDefinitionNode[] = definitions.map((d) => ({
    type: 'footnote-definition',
    version: 1,
    targetKey: d.targetKey,
    index: d.index,
    children: structuredClone(d.children),
  }))

  const merged: InklingDocument = {
    ...proseDocument,
    root: { ...proseDocument.root, children: [...proseChildren, ...definitionBlocks] },
  }

  // Canonicalise indices (first-reference order) and drop orphans in one
  // pass. `synchronizeInklingFootnoteIndices` also sorts definitions by index
  // and appends them after prose, which is exactly the persisted shape
  // renderers expect.
  const canonical = synchronizeInklingFootnoteIndices(merged).document
  return removeOrphanFootnoteDefinitions(canonical)
}

export interface OnInklingDocumentChangePluginProps {
  /** Fired on every editor update with a validated Inkling document. */
  onChange: (document: InklingDocument) => void
  /** Parallel-state footnote definitions. When omitted, no footnote-merge
   *  runs (used by editors without footnotes, e.g. comment editor — though
   *  that path currently uses the raw `OnChangePlugin` directly). */
  getDefinitions?: () => readonly FootnoteDefinitionItem[]
}

export function OnInklingDocumentChangePlugin({ onChange, getDefinitions }: OnInklingDocumentChangePluginProps) {
  const handleChange = useCallback(
    (editorState: EditorState) => {
      const document = mergeFootnoteDefinitions(editorState, { getDefinitions })
      const validation = safeValidateInklingDocument(document)
      if (validation.ok) {
        onChange(validation.document)
      } else {
        // Schema validation failed — the editor produced a document that does
        // not satisfy the Inkling contract. We must NOT swallow this silently:
        // otherwise `onChange` never fires, autosave stalls, and the user sees
        // a healthy editor while their content is never persisted. Surface the
        // error so it shows up in telemetry / dev console, then bail (we can't
        // safely persist an invalid document).
        reportEditorError(
          new Error(
            `Inkling document failed schema validation: ${validation.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          ),
          'serialize',
        )
      }
    },
    [onChange, getDefinitions],
  )

  return <OnChangePlugin onChange={handleChange} />
}
