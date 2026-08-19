import type { Editor } from '@tiptap/core'

import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'

/** Toolbar: insert linked text at caret. Bubble: set link on current selection (or edit existing). */
export type LinkPopoverVariant = 'selection' | 'toolbar'

export interface LinkPopoverProps {
  editor: Editor
  variant: LinkPopoverVariant
  onClose: () => void
}

function isNewTabTarget(target: string | null | undefined): boolean {
  return target === '_blank'
}

/** Attributes for Tiptap `link` / `setLink`. Pass null for same-tab so PM clears attrs instead of keeping schema defaults. */
function linkMarkAttributes(
  href: string,
  openInNewTab: boolean,
): { href: string; rel: string | null; target: string | null } {
  if (!openInNewTab) {
    return { href, target: null, rel: null }
  }
  return { href, target: '_blank', rel: 'noreferrer noopener' }
}

export function LinkPopover({ editor, variant, onClose }: LinkPopoverProps) {
  const linkAttrs = editor.getAttributes('link') as {
    href?: string
    rel?: string
    target?: string
  }
  const initialHref = linkAttrs.href ?? ''
  const initialNewTab = isNewTabTarget(linkAttrs.target)

  const [linkText, setLinkText] = useState('')
  const [href, setHref] = useState(initialHref)
  const [openInNewTab, setOpenInNewTab] = useState(
    variant === 'toolbar' ? false : initialHref === '' ? false : initialNewTab,
  )

  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const newTabFieldId = useId()

  // Focus the first field on open; each popover mounts fresh with a fixed variant.
  useEffect(() => {
    firstFieldRef.current?.focus()
    firstFieldRef.current?.select()
  }, [])

  const applyToolbar = () => {
    const text = linkText.trim()
    const url = href.trim()
    if (text === '' || url === '') {
      return
    }
    const attrs = linkMarkAttributes(url, openInNewTab)
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text,
        marks: [{ type: 'link', attrs }],
      })
      .run()
    onClose()
  }

  const applySelection = () => {
    const url = href.trim()
    if (url === '') {
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
      }
      onClose()
      return
    }
    const chain = editor.chain().focus()
    if (editor.isActive('link')) {
      chain.extendMarkRange('link')
    }
    chain.setLink(linkMarkAttributes(url, openInNewTab)).run()
    onClose()
  }

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }

  const onSubmit = () => {
    if (variant === 'toolbar') {
      applyToolbar()
    } else {
      applySelection()
    }
  }

  const showRemove = variant === 'selection' && initialHref !== ''

  return (
    <div
      className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border bg-popover p-3 text-sm shadow-md"
      onMouseDown={(event) => {
        event.preventDefault()
      }}
    >
      {variant === 'toolbar' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="link-popover-text">
              显示文字
            </Label>
            <Input
              ref={firstFieldRef}
              id="link-popover-text"
              type="text"
              value={linkText}
              placeholder="链接显示的文字"
              onChange={(event) => setLinkText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="link-popover-href-toolbar">
              链接地址
            </Label>
            <Input
              id="link-popover-href-toolbar"
              type="url"
              inputMode="url"
              value={href}
              placeholder="https://"
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="link-popover-href-selection">
            链接地址
          </Label>
          <Input
            ref={firstFieldRef}
            id="link-popover-href-selection"
            type="url"
            inputMode="url"
            value={href}
            placeholder="https://"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              }
            }}
          />
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-xs" htmlFor={newTabFieldId}>
        <Checkbox
          id={newTabFieldId}
          checked={openInNewTab}
          onCheckedChange={(value) => {
            setOpenInNewTab(value === true)
          }}
        />
        <span>在新标签页中打开</span>
      </label>

      <div className="flex flex-wrap justify-end gap-1">
        {showRemove ? (
          <Button variant="ghost" size="sm" type="button" onClick={removeLink} title="移除链接">
            <Trash2Icon /> 移除
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" type="button" onClick={onClose} title="取消">
          <XIcon /> 取消
        </Button>
        <Button size="sm" type="button" onClick={onSubmit} title={variant === 'toolbar' ? '插入' : '应用'}>
          <CheckIcon /> {variant === 'toolbar' ? '插入' : '应用'}
        </Button>
      </div>
    </div>
  )
}
