import type { LexicalEditor } from 'lexical'

import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $createListItemNode, $createListNode, $isListNode, ListNode } from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createQuoteNode, $isQuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  ElementNode,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { $createCodeBlockNode } from '@/ui/inkling/editor/comment/nodes/CodeBlockNode'
import { $createMathBlockNode } from '@/ui/inkling/editor/comment/nodes/MathBlockNode'
import { cn } from '@/ui/lib/cn'

export interface CommentEditorToolbarProps {
  disabled: boolean
}

const DEFAULT_MATH_BLOCK_TEX = ['\\begin{align*}', '    a &= b\\\\', '    c &= d', '\\end{align*}'].join('\n')
const DEFAULT_CODE = "console.log('hello')"

export function CommentEditorToolbar({ disabled }: CommentEditorToolbarProps) {
  const [editor] = useLexicalComposerContext()

  const [state, setState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    link: false,
  })

  const [linkPromptSeed, setLinkPromptSeed] = useState<string | null>(null)

  useEffect(() => {
    if (disabled) {
      return undefined
    }

    const updateToolbar = () => {
      editor.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }
        const anchorNode = selection.anchor.getNode()
        const element = $isElementNode(anchorNode) ? anchorNode : anchorNode.getParentOrThrow()

        setState({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strike: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
          bulletList: element.getType() === 'listitem' && findParentList(element)?.getListType() === 'bullet',
          orderedList: element.getType() === 'listitem' && findParentList(element)?.getListType() === 'number',
          blockquote: $isQuoteNode(element) || element.getType() === 'quote',
          link: selection.getNodes().some((node) => node.getType() === 'link'),
        })
      })
    }

    updateToolbar()

    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar()
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, disabled])

  const toggleFormat = (format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code') => {
    if (disabled) {
      return
    }
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
  }

  const toggleBulletList = () => {
    if (disabled) {
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }
      const anchorNode = selection.anchor.getNode()
      const element = $isElementNode(anchorNode) ? anchorNode : anchorNode.getParentOrThrow()
      const parentList = findParentList(element)
      if (parentList !== null && parentList.getListType() === 'bullet') {
        unwrapList(editor)
      } else {
        wrapInList(editor, 'bullet')
      }
    })
  }

  const toggleOrderedList = () => {
    if (disabled) {
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }
      const anchorNode = selection.anchor.getNode()
      const element = $isElementNode(anchorNode) ? anchorNode : anchorNode.getParentOrThrow()
      const parentList = findParentList(element)
      if (parentList !== null && parentList.getListType() === 'number') {
        unwrapList(editor)
      } else {
        wrapInList(editor, 'number')
      }
    })
  }

  const toggleBlockquote = () => {
    if (disabled) {
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }
      const anchorNode = selection.anchor.getNode()
      const element = $isElementNode(anchorNode) ? anchorNode : anchorNode.getParentOrThrow()
      if ($isQuoteNode(element)) {
        const paragraph = $createParagraphNode()
        element.getChildren().forEach((child) => paragraph.append(child))
        element.replace(paragraph)
        paragraph.selectEnd()
      } else {
        const quote = $createQuoteNode()
        quote.append(...element.getChildren())
        element.replace(quote)
        quote.selectEnd()
      }
    })
  }

  const promptLink = () => {
    if (disabled) {
      return
    }
    editor.read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return
      }
      const node = selection.getNodes().find((n) => $isLinkNode(n))
      const href = $isLinkNode(node) ? node.getURL() : ''
      setLinkPromptSeed(href)
    })
  }

  const applyLink = (href: string | null) => {
    if (disabled) {
      return
    }
    editor.focus(() => {
      editor.dispatchCommand(
        TOGGLE_LINK_COMMAND,
        href === null ? null : { url: href, target: '_blank', rel: 'nofollow noreferrer' },
      )
    })
  }

  const insertCodeBlock = () => {
    if (disabled) {
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      if (selection === null) {
        return
      }
      const codeBlock = $createCodeBlockNode(DEFAULT_CODE)
      if ($isRangeSelection(selection)) {
        selection.insertNodes([codeBlock])
      } else {
        selection.getNodes()[0]?.insertAfter(codeBlock)
      }
    })
  }

  const insertMathBlock = () => {
    if (disabled) {
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      if (selection === null) {
        return
      }
      const mathBlock = $createMathBlockNode(DEFAULT_MATH_BLOCK_TEX)
      if ($isRangeSelection(selection)) {
        selection.insertNodes([mathBlock])
      } else {
        selection.getNodes()[0]?.insertAfter(mathBlock)
      }
    })
  }

  return (
    <>
      <div
        className={cn(
          'hidden flex-wrap items-center gap-0.5 border-b border-line/60 px-2 py-1',
          'group-focus-within/comment-editor:flex',
        )}
        aria-label="评论格式工具栏"
      >
        <ToolButton
          title="加粗 (Cmd/Ctrl+B)"
          disabled={disabled}
          state={state.bold ? 'active' : 'inactive'}
          onClick={() => toggleFormat('bold')}
        >
          <BoldIcon />
        </ToolButton>
        <ToolButton
          title="斜体 (Cmd/Ctrl+I)"
          disabled={disabled}
          state={state.italic ? 'active' : 'inactive'}
          onClick={() => toggleFormat('italic')}
        >
          <ItalicIcon />
        </ToolButton>
        <ToolButton
          title="下划线 (Cmd/Ctrl+U)"
          disabled={disabled}
          state={state.underline ? 'active' : 'inactive'}
          onClick={() => toggleFormat('underline')}
        >
          <UnderlineIcon />
        </ToolButton>
        <ToolButton
          title="删除线"
          disabled={disabled}
          state={state.strike ? 'active' : 'inactive'}
          onClick={() => toggleFormat('strikethrough')}
        >
          <StrikethroughIcon />
        </ToolButton>
        <ToolButton
          title="行内代码"
          disabled={disabled}
          state={state.code ? 'active' : 'inactive'}
          onClick={() => toggleFormat('code')}
        >
          <CodeIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton
          title="无序列表"
          disabled={disabled}
          state={state.bulletList ? 'active' : 'inactive'}
          onClick={toggleBulletList}
        >
          <ListIcon />
        </ToolButton>
        <ToolButton
          title="有序列表"
          disabled={disabled}
          state={state.orderedList ? 'active' : 'inactive'}
          onClick={toggleOrderedList}
        >
          <ListOrderedIcon />
        </ToolButton>
        <ToolButton
          title="引用"
          disabled={disabled}
          state={state.blockquote ? 'active' : 'inactive'}
          onClick={toggleBlockquote}
        >
          <QuoteIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton title="链接" disabled={disabled} state={state.link ? 'active' : 'inactive'} onClick={promptLink}>
          <LinkIcon />
        </ToolButton>
        <ToolDivider />
        <ToolButton title="代码块" disabled={disabled} state="inactive" onClick={insertCodeBlock}>
          <CodeIcon />
        </ToolButton>
        <ToolButton title="公式块" disabled={disabled} state="inactive" onClick={insertMathBlock}>
          <span className="font-serif text-xs">Σ</span>
        </ToolButton>
      </div>
      <LinkPromptDialog
        seed={linkPromptSeed}
        onClose={() => setLinkPromptSeed(null)}
        onConfirm={(href) => {
          applyLink(href)
          setLinkPromptSeed(null)
        }}
      />
    </>
  )
}

function findParentList(node: ElementNode): ListNode | null {
  let current = node.getParent()
  while (current !== null) {
    if ($isListNode(current)) {
      return current
    }
    current = current.getParent()
  }
  return null
}

function wrapInList(editor: LexicalEditor, listType: 'bullet' | 'number'): void {
  editor.update(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    const anchorNode = selection.anchor.getNode()
    const element = $isElementNode(anchorNode) ? anchorNode : anchorNode.getParentOrThrow()
    const list = $createListNode(listType)
    const listItem = $createListItemNode()
    listItem.append(...element.getChildren())
    list.append(listItem)
    element.replace(list)
    listItem.selectEnd()
  })
}

function unwrapList(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    const anchorNode = selection.anchor.getNode()
    const element = $isElementNode(anchorNode) ? anchorNode : anchorNode.getParentOrThrow()
    const listItem = element.getType() === 'listitem' ? element : element.getParentOrThrow()
    if (listItem.getType() !== 'listitem') {
      return
    }
    const paragraph = $createParagraphNode()
    paragraph.append(...listItem.getChildren())
    listItem.replace(paragraph)
    paragraph.selectEnd()
  })
}

interface LinkPromptDialogProps {
  seed: string | null
  onClose: () => void
  onConfirm: (href: string | null) => void
}

function LinkPromptDialog({ seed, onClose, onConfirm }: LinkPromptDialogProps) {
  const [value, setValue] = useState('')
  const [lastSeed, setLastSeed] = useState(seed)
  if (seed !== lastSeed) {
    setLastSeed(seed)
    if (seed !== null) {
      setValue(seed)
    }
  }

  const open = seed !== null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑链接</DialogTitle>
          <DialogDescription>填写链接地址，留空可移除当前链接。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = value.trim()
            onConfirm(trimmed === '' ? null : trimmed)
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="comment-link-href">链接地址</Label>
            <Input
              id="comment-link-href"
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">插入链接</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ToolButtonProps {
  title: string
  disabled: boolean
  state?: 'active' | 'inactive'
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ title, disabled, state, onClick, children }: ToolButtonProps) {
  const isActive = state === 'active'
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={isActive}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-sm',
        '[&_svg]:size-4',
        'text-ink-4 hover:bg-surface hover:text-ink-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isActive && 'bg-surface text-brand',
      )}
    >
      {children}
    </button>
  )
}

function ToolDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-line/60" />
}
