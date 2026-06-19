import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { useCallback, useEffect, useState } from 'react'

import type {
  InklingCodeBlockNode,
  InklingImageCardNode,
  InklingImageLayout,
  InklingMathBlockNode,
  InklingMusicCardNode,
  InklingTableNode,
} from '@/shared/inkling/schema'
import type {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'

import { useInklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'
import { cn } from '@/ui/lib/cn'

const COMMON_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'html',
  'css',
  'json',
  'yaml',
  'bash',
  'sql',
  'ruby',
  'swift',
  'kotlin',
  'php',
  'markdown',
  'plaintext',
]

interface CardShellProps {
  nodeKey: string
  children: ReactNode
  className?: string
}

/** Ghost-style card wrapper — brand shadow on select, subtle ring on hover. */
function CardShell({ nodeKey, children, className }: CardShellProps): ReactNode {
  const [isSelected] = useLexicalNodeSelection(nodeKey)
  return (
    <div
      className={cn(
        'inkling-card caret-grey-800 relative border-transparent transition-shadow',
        'hover:shadow-[0_0_0_1px] hover:shadow-brand/40',
        isSelected && 'z-20 shadow-[0_0_0_2px] shadow-brand',
        className,
      )}
      data-inkling-card
      data-inkling-card-key={nodeKey}
      data-inkling-card-selected={isSelected || undefined}
    >
      {isSelected ? (
        <div
          className="inkling-card-drag-handle absolute top-1 -left-6 flex cursor-grab items-center rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          draggable
          title="拖拽排序"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      ) : null}
      {children}
    </div>
  )
}

function parseImageLayout(value: string): InklingImageLayout | undefined {
  switch (value) {
    case 'left':
    case 'center':
    case 'right':
      return value
    default:
      return undefined
  }
}

/* ─── Image Card ────────────────────────────────────────────────── */

export function ImageCardComponent({ node }: { node: ImageCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(node.getKey())
  const { openImagePicker } = useInklingArticleEditorActions()

  const update = useCallback(
    (patch: Partial<InklingImageCardNode>): void => {
      editor.update(() => {
        if (patch.src !== undefined) {
          node.setSrc(patch.src)
        }
        if (patch.alt !== undefined) {
          node.setAlt(patch.alt)
        }
        if (patch.caption !== undefined) {
          node.setCaption(patch.caption)
        }
        if (patch.layout !== undefined) {
          node.setLayout(patch.layout)
        }
        if (patch.width !== undefined) {
          node.setWidth(patch.width)
        }
        if (patch.height !== undefined) {
          node.setHeight(patch.height)
        }
        if (patch.thumbhash !== undefined) {
          node.setThumbhash(patch.thumbhash)
        }
        if (patch.storagePath !== undefined) {
          node.setStoragePath(patch.storagePath)
        }
        if (patch.imageId !== undefined) {
          node.setImageId(patch.imageId)
        }
      })
    },
    [editor, node],
  )

  const handlePick = () => openImagePicker?.()

  return (
    <CardShell nodeKey={node.getKey()} className="space-y-2 p-3">
      {node.getSrc() === '' ? (
        <button
          type="button"
          onClick={handlePick}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-brand/30 bg-muted/20 py-10 text-sm text-muted-foreground transition hover:border-brand/60 hover:bg-muted/40"
        >
          <svg className="h-8 w-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
          <span>选择图片</span>
        </button>
      ) : (
        <img
          src={node.getSrc()}
          alt={node.getAlt()}
          className="max-h-96 w-full rounded object-contain"
          decoding="async"
        />
      )}
      {node.getSrc() !== '' && !isSelected ? (
        <div className="text-center text-xs text-muted-foreground">点击卡片进入编辑模式</div>
      ) : null}
      {isSelected ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={node.getAlt()}
              onChange={(e) => update({ alt: e.target.value })}
              placeholder="替代文本 (alt)"
              className="flex-1 rounded border bg-background px-2 py-1 text-sm"
            />
            <select
              value={node.getLayout()}
              onChange={(e) => {
                const layout = parseImageLayout(e.target.value)
                if (layout !== undefined) {
                  update({ layout })
                }
              }}
              className="rounded border bg-background px-2 py-1 text-sm"
            >
              <option value="center">居中</option>
              <option value="left">左对齐</option>
              <option value="right">右对齐</option>
            </select>
          </div>
          <input
            type="text"
            value={node.getCaption()}
            onChange={(e) => update({ caption: e.target.value })}
            placeholder="图片说明 (caption)"
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
          <button type="button" onClick={handlePick} className="text-sm text-brand hover:underline">
            更换图片
          </button>
        </div>
      ) : null}
    </CardShell>
  )
}

/* ─── Code Card ─────────────────────────────────────────────────── */

export function CodeCardComponent({ node }: { node: CodeCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(node.getKey())
  const [preview, setPreview] = useState(false)

  const update = useCallback(
    (patch: Partial<InklingCodeBlockNode>): void => {
      editor.update(() => {
        if (patch.code !== undefined) {
          node.setCode(patch.code)
        }
        if (patch.language !== undefined) {
          node.setLanguage(patch.language)
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
                <option key={lang} value={lang} label={lang} />
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
              dangerouslySetInnerHTML={{ __html: node.getHighlightedHtml() ?? '' }}
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
          dangerouslySetInnerHTML={{ __html: node.getHighlightedHtml() ?? '' }}
        />
      ) : (
        <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">
          <code>{node.getCode().slice(0, 500) || '// 空代码块（点击编辑）'}</code>
        </pre>
      )}
    </CardShell>
  )
}

/* ─── Math Card ─────────────────────────────────────────────────── */

function MathPreview({ tex }: { tex: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tex.trim().length === 0) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          // Reuse the existing oRPC math render endpoint (POC-proven pattern).
          const { orpc } = await import('@/client/api/client')
          const result = await orpc.admin.renders.math({ tex, display: true })
          if (!cancelled) {
            setHtml(result.mathml ?? null)
          }
        } catch {
          if (!cancelled) {
            setHtml(null)
          }
        } finally {
          if (!cancelled) {
            setLoading(false)
          }
        }
      })()
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tex])

  if (loading) {
    return <div className="py-4 text-center text-xs text-muted-foreground">渲染中…</div>
  }
  if (tex.trim().length === 0 || html === null) {
    return <div className="py-4 text-center font-mono text-sm">$${tex || '\\text{输入 TeX 公式}'}$$</div>
  }
  return <div className="overflow-x-auto py-4 text-center" dangerouslySetInnerHTML={{ __html: html }} />
}

export function MathCardComponent({ node }: { node: MathCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(node.getKey())

  const update = useCallback(
    (patch: Partial<InklingMathBlockNode>): void => {
      editor.update(() => {
        if (patch.tex !== undefined) {
          node.setTex(patch.tex)
        }
      })
    },
    [editor, node],
  )

  return (
    <CardShell nodeKey={node.getKey()} className="p-3">
      {isSelected ? (
        <textarea
          value={node.getTex()}
          onChange={(e) => update({ tex: e.target.value })}
          rows={4}
          placeholder="e^{i\\pi} + 1 = 0"
          className="w-full rounded border bg-background px-2 py-1 font-mono text-sm"
        />
      ) : null}
      <MathPreview tex={node.getTex()} />
    </CardShell>
  )
}

/* ─── Music Card ────────────────────────────────────────────────── */

export function MusicCardComponent({ node }: { node: MusicCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(node.getKey())
  const { openMusicPicker } = useInklingArticleEditorActions()

  const update = useCallback(
    (patch: Partial<InklingMusicCardNode>): void => {
      editor.update(() => {
        if (patch.playerId !== undefined) {
          node.setPlayerId(patch.playerId)
        }
        if (patch.auto !== undefined) {
          node.setAuto(patch.auto)
        }
        if (patch.center !== undefined) {
          node.setCenter(patch.center)
        }
      })
    },
    [editor, node],
  )

  const handlePick = () => openMusicPicker?.()

  return (
    <CardShell nodeKey={node.getKey()} className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
          {node.getPlayerId() || '未选择音乐'}
        </span>
        <button
          type="button"
          onClick={handlePick}
          className="rounded border bg-background px-2 py-0.5 text-xs text-brand hover:bg-accent"
        >
          选择音乐
        </button>
      </div>
      {isSelected ? (
        <div className="flex gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={node.getAuto()} onChange={(e) => update({ auto: e.target.checked })} />
            自动播放
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={node.getCenter()} onChange={(e) => update({ center: e.target.checked })} />
            居中显示
          </label>
        </div>
      ) : null}
    </CardShell>
  )
}

/* ─── Horizontal Rule Card ──────────────────────────────────────── */

export function HorizontalRuleCardComponent({ node }: { node: HorizontalRuleCardNode }): ReactNode {
  return (
    <CardShell nodeKey={node.getKey()} className="py-3">
      <hr className="border-inkling-border" />
    </CardShell>
  )
}

/* ─── Table Card ────────────────────────────────────────────────── */

function emptyRow(cellCount: number): {
  type: 'tablerow'
  version: number
  cells: Array<{ type: 'tablecell'; version: number; isHeader?: boolean; children: [] }>
} {
  return {
    type: 'tablerow',
    version: 1,
    cells: Array.from({ length: cellCount }, () => ({ type: 'tablecell', version: 1, isHeader: false, children: [] })),
  }
}

export function TableCardComponent({ node }: { node: TableCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(node.getKey())

  const update = useCallback(
    (patch: Partial<InklingTableNode>): void => {
      editor.update(() => {
        if (patch.rows !== undefined) {
          node.setRows(patch.rows)
        }
      })
    },
    [editor, node],
  )

  const rows = node.getRows()
  const cellCount = rows[0]?.cells.length ?? 2

  const addRow = () => update({ rows: [...rows, emptyRow(cellCount)] })
  const addCol = () =>
    update({
      rows: rows.map((row) => ({ ...row, cells: [...row.cells, { type: 'tablecell', version: 1, children: [] }] })),
    })
  const deleteRow = (idx: number) => {
    if (rows.length <= 1) {
      return
    }
    update({ rows: rows.filter((_, i) => i !== idx) })
  }
  const deleteCol = (idx: number) => {
    if (cellCount <= 1) {
      return
    }
    update({ rows: rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => i !== idx) })) })
  }
  const hasHeaderRow = rows[0]?.cells.some((cell) => cell.isHeader === true) ?? false
  const toggleHeaderRow = () => {
    update({
      rows: rows.map((row, index) =>
        index === 0 ? { ...row, cells: row.cells.map((cell) => ({ ...cell, isHeader: !hasHeaderRow })) } : row,
      ),
    })
  }

  return (
    <CardShell nodeKey={node.getKey()} className="p-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.key ?? rowIndex}>
                {row.cells.map((cell, cellIndex) => {
                  const CellTag = cell.isHeader === true ? 'th' : 'td'
                  return (
                    <CellTag
                      key={cell.key ?? cellIndex}
                      className="border border-muted-foreground/30 px-2 py-1 text-sm"
                    >
                      {isSelected ? (
                        <input
                          type="text"
                          value={cell.children.map((c) => (c.type === 'text' ? c.text : '')).join('')}
                          onChange={(e) => {
                            const newRows = rows.map((r, ri) =>
                              ri === rowIndex
                                ? {
                                    ...r,
                                    cells: r.cells.map((c, ci) =>
                                      ci === cellIndex
                                        ? { ...c, children: [{ type: 'text', version: 1, text: e.target.value }] }
                                        : c,
                                    ),
                                  }
                                : r,
                            )
                            update({ rows: newRows as InklingTableNode['rows'] })
                          }}
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      ) : (
                        cell.children.map((child) => (child.type === 'text' ? child.text : '')).join('')
                      )}
                    </CellTag>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isSelected ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={addRow}
            className="rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            ＋行
          </button>
          <button
            type="button"
            onClick={() => {
              if (rows.length > 1) {
                deleteRow(rows.length - 1)
              }
            }}
            className="rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            −行
          </button>
          <button
            type="button"
            onClick={addCol}
            className="rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            ＋列
          </button>
          <button
            type="button"
            onClick={() => {
              if (cellCount > 1) {
                deleteCol(cellCount - 1)
              }
            }}
            className="rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            −列
          </button>
          <button
            type="button"
            onClick={toggleHeaderRow}
            className={cn(
              'rounded border px-2 py-0.5 text-xs',
              hasHeaderRow
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {hasHeaderRow ? '取消表头' : '设为表头'}
          </button>
        </div>
      ) : null}
    </CardShell>
  )
}
