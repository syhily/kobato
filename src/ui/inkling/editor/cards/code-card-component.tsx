import type { ReactNode } from 'react'

import { useCallback, useState } from 'react'

import type { InklingCodeBlockNode } from '@/shared/inkling/schema'
import type { CodeCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { CardShell, COMMON_LANGUAGES } from '@/ui/inkling/editor/cards/card-shell'
import { useCardNode } from '@/ui/inkling/editor/cards/use-card-node'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'

export function CodeCardComponent({ node }: { node: CodeCardNode }): ReactNode {
  const { editor, isSelected } = useCardNode(node)
  const [preview, setPreview] = useState(false)

  const update = useCallback(
    (patch: Partial<InklingCodeBlockNode>): void => {
      editor.update(() => {
        if (patch.code !== undefined) {
          node.setCode(patch.code)
          // `highlightedHtml` is a server-side prerender artifact (filled by
          // `prerenderInklingDocument` at save time). Once the user edits the
          // source it is stale — clear it so the editor shows plain text
          // instead of outdated highlighting, and so the save path re-runs
          // Shiki. Mirrors how `mathml` is treated as a derived artifact.
          if (node.getHighlightedHtml() !== undefined) {
            node.setHighlightedHtml(undefined)
          }
        }
        if (patch.language !== undefined) {
          node.setLanguage(patch.language)
          // Language change also invalidates the highlight (different grammar).
          if (patch.code === undefined && node.getHighlightedHtml() !== undefined) {
            node.setHighlightedHtml(undefined)
          }
        }
      })
    },
    [editor, node],
  )

  return (
    <CardShell nodeKey={node.getKey()} className="p-3">
      {isSelected ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              list="inkling-languages"
              type="text"
              value={node.getLanguage() ?? ''}
              onChange={(e) => update({ language: e.target.value })}
              placeholder="语言 (可选)"
              className="flex-1 rounded border bg-background px-2 py-1 font-mono text-xs"
            />
            <datalist id="inkling-languages">
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {preview ? '编辑' : '预览'}
            </button>
          </div>
          {preview && node.getHighlightedHtml() !== undefined ? (
            <pre
              className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.getHighlightedHtml() ?? '', 'shiki') }}
            />
          ) : preview ? (
            <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
              <code>{node.getCode()}</code>
            </pre>
          ) : (
            <textarea
              value={node.getCode()}
              onChange={(e) => update({ code: e.target.value })}
              rows={8}
              spellCheck={false}
              className="w-full rounded border bg-background px-2 py-1 font-mono text-sm leading-relaxed"
            />
          )}
        </div>
      ) : node.getHighlightedHtml() !== undefined ? (
        <pre
          className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.getHighlightedHtml() ?? '', 'shiki') }}
        />
      ) : (
        <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">
          <code>{node.getCode().slice(0, 500) || '// 空代码块（点击编辑）'}</code>
        </pre>
      )}
    </CardShell>
  )
}
