import type { ReactNode } from 'react'

import { useCallback, useState } from 'react'

import type { InklingCodeBlockNode } from '@/shared/inkling/schema'
import type { CodeCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { CardShell, COMMON_LANGUAGES } from '@/ui/inkling/editor/cards/card-shell'
import { useCardNode } from '@/ui/inkling/editor/cards/use-card-node'
import { CodeBlock as CodeBlockRenderer } from '@/ui/inkling/render/blocks/CodeBlock'

export function CodeCardComponent({ node }: { node: CodeCardNode }): ReactNode {
  const { editor, isSelected } = useCardNode(node)
  const [preview, setPreview] = useState(false)

  const update = useCallback(
    (patch: Partial<InklingCodeBlockNode>): void => {
      editor.update(() => {
        if (patch.code !== undefined) {
          node.setCode(patch.code)
          if (node.getHighlightedHtml() !== undefined) {
            node.setHighlightedHtml(undefined)
          }
        }
        if (patch.language !== undefined) {
          node.setLanguage(patch.language)
          if (patch.code === undefined && node.getHighlightedHtml() !== undefined) {
            node.setHighlightedHtml(undefined)
          }
        }
      })
    },
    [editor, node],
  )

  // Build a plain InklingCodeBlockNode for the render component.
  const renderNode: InklingCodeBlockNode = {
    type: 'code-block',
    version: 1,
    code: node.getCode(),
    language: node.getLanguage(),
    highlightedHtml: node.getHighlightedHtml(),
  }

  if (!isSelected) {
    // Idle: render the published CodeBlock component (header + copy button + Shiki)
    return (
      <CardShell nodeKey={node.getKey()} className="p-0">
        <CodeBlockRenderer node={renderNode} />
      </CardShell>
    )
  }

  return (
    <CardShell nodeKey={node.getKey()} className="space-y-2 p-3">
      <div className="inkling-card-controlbar">
        <input
          list="inkling-languages"
          type="text"
          value={node.getLanguage() ?? ''}
          onChange={(e) => update({ language: e.target.value })}
          placeholder="语言 (可选)"
          className="inkling-card-input"
        />
        <datalist id="inkling-languages">
          {COMMON_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </datalist>
        <button type="button" onClick={() => setPreview(!preview)} className="inkling-card-button">
          {preview ? '编辑' : '预览'}
        </button>
      </div>
      {preview ? (
        node.getHighlightedHtml() !== undefined ? (
          <CodeBlockRenderer node={renderNode} />
        ) : (
          <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
            <code>{node.getCode()}</code>
          </pre>
        )
      ) : (
        <textarea
          value={node.getCode()}
          onChange={(e) => update({ code: e.target.value })}
          rows={8}
          spellCheck={false}
          className="inkling-card-textarea"
        />
      )}
    </CardShell>
  )
}
