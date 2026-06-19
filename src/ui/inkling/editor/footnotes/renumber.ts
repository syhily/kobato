import type { LexicalEditor, LexicalNode } from 'lexical'

import { $getEditor, $getRoot, $isElementNode } from 'lexical'

import type { InklingDocument } from '@/shared/inkling/schema'

import { collectFootnoteDefinitions, collectFootnoteRefs } from '@/shared/inkling/footnotes'

import { FootnoteDefinitionNode } from './FootnoteDefinitionNode'
import { FootnoteRefNode } from './FootnoteRefNode'

function buildTargetKeyToIndexMap(document: InklingDocument): Map<string, number> {
  const refs = collectFootnoteRefs(document)
  const defs = collectFootnoteDefinitions(document)

  const keyToIndex = new Map<string, number>()
  const seen = new Set<string>()

  for (const ref of refs) {
    if (seen.has(ref.targetKey)) {
      continue
    }
    seen.add(ref.targetKey)
    keyToIndex.set(ref.targetKey, seen.size)
  }

  for (const def of defs) {
    if (seen.has(def.targetKey)) {
      continue
    }
    seen.add(def.targetKey)
    keyToIndex.set(def.targetKey, seen.size)
  }

  return keyToIndex
}

function collectEditorStateAsInklingDocument(editor: LexicalEditor): InklingDocument {
  const serialized = editor.getEditorState().toJSON()
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: serialized.root as InklingDocument['root'],
  }
}

function $applyFootnoteIndexChanges(keyToIndex: Map<string, number>): void {
  const root = $getRoot()
  const stack: LexicalNode[] = [root]

  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) {
      continue
    }

    if (node instanceof FootnoteRefNode) {
      const newIndex = keyToIndex.get(node.getTargetKey())
      if (newIndex !== undefined && newIndex !== node.getIndex()) {
        node.setIndex(newIndex)
      }
    } else if (node instanceof FootnoteDefinitionNode) {
      const newIndex = keyToIndex.get(node.getTargetKey())
      if (newIndex !== undefined && newIndex !== node.getIndex()) {
        node.setIndex(newIndex)
      }
    }

    if ($isElementNode(node)) {
      stack.push(...node.getChildren())
    }
  }
}

export function $renumberFootnotes(): void {
  const editor = $getEditor()
  const document = collectEditorStateAsInklingDocument(editor)
  const keyToIndex = buildTargetKeyToIndexMap(document)
  $applyFootnoteIndexChanges(keyToIndex)
}

export function applyFootnoteRenumberWithHistoryMerge(editor: LexicalEditor): void {
  editor.update(() => $renumberFootnotes(), { tag: 'history-merge', discrete: true })
}
