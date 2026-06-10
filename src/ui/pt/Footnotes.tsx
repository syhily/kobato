import {
  cloneElement,
  createContext,
  isValidElement,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'

import { Tooltip } from '@/ui/components/tooltip'

interface FootnoteContextValue {
  previews: ReadonlyMap<string, ReactNode>
}

type FootnoteRegister = (href: string, preview: ReactNode) => () => void

interface FootnoteElementProps {
  children?: ReactNode
  className?: string
  href?: string
  id?: string
  dataFootnoteBackref?: boolean
  'data-footnote-backref'?: boolean
}

const FootnotePreviewContext = createContext<FootnoteContextValue | null>(null)
const FootnoteRegisterContext = createContext<FootnoteRegister | null>(null)
const FOOTNOTE_ID_PREFIX = 'user-content-fn-'
const FOOTNOTE_REF_ID_PREFIX = 'user-content-fnref-'

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
  const previewRef = useRef(preview)
  previewRef.current = preview

  useEffect(() => {
    if (register === null) {
      return
    }
    const href = `#${anchorId}`
    return register(href, previewRef.current)
  }, [anchorId, register])

  return null
}

export function FootnoteDefinition({ children, id, ...props }: ComponentProps<'li'>) {
  const register = use(FootnoteRegisterContext)
  const isFootnote = typeof id === 'string' && id.startsWith(FOOTNOTE_ID_PREFIX)
  const preview = useMemo(() => stripBackrefs(children), [children])
  const previewRef = useRef(preview)
  previewRef.current = preview

  useEffect(() => {
    if (!isFootnote || register === null || typeof id !== 'string') {
      return
    }
    return register(`#${id}`, previewRef.current)
  }, [id, isFootnote, register])

  return (
    <li {...props} id={id}>
      {children}
    </li>
  )
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

function stripBackrefs(node: ReactNode): ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return null
  }
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(stripBackrefs).filter((child) => child !== null)
  }
  if (!isValidElement<FootnoteElementProps>(node)) {
    return node
  }
  if (isBackref(node.props)) {
    return null
  }

  const children = stripBackrefs(node.props.children)
  return cloneElement(node as ReactElement<FootnoteElementProps>, undefined, children)
}

function isBackref(props: FootnoteElementProps): boolean {
  return (
    props.dataFootnoteBackref === true ||
    props['data-footnote-backref'] === true ||
    props.className?.split(/\s+/).includes('data-footnote-backref') === true
  )
}
