import {
  createContext,
  isValidElement,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'

import { FOOTNOTE_ID_PREFIX, FOOTNOTE_REF_ID_PREFIX } from '@/shared/pt/footnote-anchors'
import { Tooltip } from '@/ui/components/tooltip'

interface FootnoteContextValue {
  previews: ReadonlyMap<string, ReactNode>
}

type FootnoteRegister = (href: string, preview: ReactNode) => () => void

interface FootnoteElementProps {
  children?: ReactNode
  href?: string
  id?: string
}

const FootnotePreviewContext = createContext<FootnoteContextValue | null>(null)
const FootnoteRegisterContext = createContext<FootnoteRegister | null>(null)

export function FootnoteProvider({ children }: { children: ReactNode }) {
  const [previews, setPreviews] = useState<ReadonlyMap<string, ReactNode>>(() => new Map())
  const register = useCallback((href: string, preview: ReactNode) => {
    setPreviews((current) => {
      const next = new Map(current)
      next.set(href, preview)
      return next
    })
    return () => {
      setPreviews((current) => {
        if (!current.has(href)) {
          return current
        }
        const next = new Map(current)
        next.delete(href)
        return next
      })
    }
  }, [])

  const value = useMemo(() => ({ previews }), [previews])
  return (
    <FootnoteRegisterContext value={register}>
      <FootnotePreviewContext value={value}>{children}</FootnotePreviewContext>
    </FootnoteRegisterContext>
  )
}

export function FootnoteReference({ children, ...props }: ComponentProps<'sup'>) {
  const context = use(FootnotePreviewContext)
  const href = footnoteReferenceHref(children)
  const preview = href === undefined ? undefined : context?.previews.get(href)

  if (preview === undefined) {
    return <sup {...props}>{children}</sup>
  }
  return (
    <Tooltip placement="top">
      <Tooltip.Trigger as="sup" {...props}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content>{preview}</Tooltip.Content>
    </Tooltip>
  )
}

export function FootnotePreviewRegistrar({ anchorId, preview }: { anchorId: string; preview: ReactNode }) {
  const register = use(FootnoteRegisterContext)

  useEffect(() => {
    if (register === null) {
      return
    }
    const href = `#${anchorId}`
    return register(href, preview)
  }, [anchorId, register, preview])

  return null
}

function isReactNodeArray(value: unknown): value is ReactNode[] {
  return Array.isArray(value)
}

function footnoteReferenceHref(node: ReactNode): string | undefined {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return undefined
  }
  if (isReactNodeArray(node)) {
    for (const child of node) {
      const href = footnoteReferenceHref(child)
      if (href !== undefined) {
        return href
      }
    }
    return undefined
  }
  if (!isValidElement<FootnoteElementProps>(node)) {
    return undefined
  }

  const { href, id, children } = node.props
  const tag = typeof node.type === 'string' ? node.type : ''
  if (typeof href === 'string' && href.startsWith(`#${FOOTNOTE_ID_PREFIX}`)) {
    if (typeof id === 'string' && id.startsWith(FOOTNOTE_REF_ID_PREFIX)) {
      return href
    }
    // Portable Text footnotes: `<sup id="user-content-fnref-N"><a href="#user-content-fn-N">`.
    if (tag === 'a') {
      return href
    }
  }
  return footnoteReferenceHref(children)
}
