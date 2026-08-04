import { cn } from '@kobato/editor/lib/cn'
import { LANGUAGE_MAP } from '@kobato/editor/lib/code-languages'
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'

function isReactNodeArray(value: unknown): value is ReactNode[] {
  return Array.isArray(value)
}

const COPY_LABEL = 'Copy'
const COPIED_LABEL = 'Copied'
const FAILED_LABEL = 'Failed'
const RESET_DELAY = 1500
const LANGUAGE_CLASS = /\blanguage-([a-z0-9_+.-]+)\b/i

type CodeBlockProps = ComponentProps<'pre'> & {
  /** Raw source for the copy button when markup is injected via `dangerouslySetInnerHTML` (e.g. Shiki HTML includes its own `<pre>`). */
  copyText?: string
}

interface CodeElementProps {
  className?: string
  'data-language'?: string
  children?: ReactNode
}

export function CodeBlock({ children, className, copyText, dangerouslySetInnerHTML, ...props }: CodeBlockProps) {
  const [label, setLabel] = useState(COPY_LABEL)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const language = getCodeLanguage(className, children)
  const displayLanguage = getLanguageLabel(language)
  const text = copyText !== undefined ? copyText : textFromReactNode(children)

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        clearTimeout(resetTimer.current)
      }
    }
  }, [])

  const onCopy = async () => {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current)
    }

    let copied = false
    try {
      copied = await copyTextToClipboard(text)
    } catch {
      copied = false
    }

    setLabel(copied ? COPIED_LABEL : FAILED_LABEL)
    resetTimer.current = setTimeout(() => setLabel(COPY_LABEL), RESET_DELAY)
  }

  return (
    <div
      className={cn(
        'code-block-wrapper',
        'relative mx-0 mt-0 mb-4 w-full overflow-hidden rounded-md',
        'in-[.comment-content]:mx-0 in-[.comment-content]:my-3 in-[.comment-content]:rounded-sm',
      )}
    >
      <div
        className={cn(
          'code-header',
          'mb-0! flex w-full items-center justify-between rounded-t-md bg-surface px-4 py-2 font-code select-none',
          'in-[.comment-content]:hidden',
        )}
      >
        <span
          className="language-label pointer-events-none font-code text-sm font-medium text-ink-1 select-none"
          aria-label={`Code language: ${displayLanguage}`}
          role="note"
        >
          {displayLanguage}
        </span>
        <button
          type="button"
          className="copy-code cursor-pointer border-0 bg-transparent font-code text-sm font-medium text-ink-1 transition-[transform,color] duration-150 ease-in-out select-none hover:scale-105 hover:text-brand"
          title={`Copy ${displayLanguage} code`}
          aria-label={`Copy ${displayLanguage} code to clipboard`}
          onClick={() => void onCopy()}
        >
          {label}
        </button>
      </div>
      {dangerouslySetInnerHTML !== undefined ? (
        <div
          className={cn(
            '[&>pre]:mt-0 [&>pre]:mb-0 [&>pre]:rounded-t-none [&>pre]:border-t-0',
            'in-[.comment-content]:[&>pre]:m-0',
            className,
          )}
          data-language={language}
          dangerouslySetInnerHTML={dangerouslySetInnerHTML}
        />
      ) : (
        <pre
          {...props}
          className={cn(className, 'mt-0 mb-0 rounded-t-none border-t-0', 'in-[.comment-content]:m-0')}
          data-language={language}
        >
          {children}
        </pre>
      )}
    </div>
  )
}

function getCodeLanguage(className: string | undefined, children: ReactNode): string {
  return (
    languageFromClassName(codeClassName(children)) ||
    languageFromClassName(className) ||
    codeDataLanguage(children) ||
    'text'
  )
}

function languageFromClassName(className: string | null | undefined): string | undefined {
  const language = className?.match(LANGUAGE_CLASS)?.[1]?.trim().toLowerCase()
  return language === '' ? undefined : language
}

function getLanguageLabel(language: string): string {
  const normalized = language.trim().toLowerCase()
  if (normalized === '') {
    return 'Text'
  }
  return LANGUAGE_MAP[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function codeClassName(children: ReactNode): string | undefined {
  const code = firstCodeElement(children)
  return code?.props.className
}

function codeDataLanguage(children: ReactNode): string | undefined {
  const code = firstCodeElement(children)
  const language = code?.props['data-language']?.trim().toLowerCase()
  return language === '' ? undefined : language
}

function firstCodeElement(children: ReactNode): ReactElement<CodeElementProps> | undefined {
  const childList = isReactNodeArray(children) ? children : [children]
  for (const child of childList) {
    if (isValidElement<CodeElementProps>(child) && child.type === 'code') {
      return child
    }
  }
  return undefined
}

function textFromReactNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join('')
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromReactNode(node.props.children)
  }
  return ''
}

interface ClipboardCopyEnvironment {
  navigator?: { clipboard?: Pick<Clipboard, 'writeText'> }
  document?: Pick<Document, 'addEventListener' | 'body' | 'createElement' | 'removeEventListener'> & {
    execCommand?: (commandId: string) => boolean
  }
}

async function copyTextToClipboard(text: string, environment: ClipboardCopyEnvironment = {}): Promise<boolean> {
  const documentRef = environment.document ?? globalThis.document
  if (legacyCopyText(text, documentRef)) {
    return true
  }

  const clipboard = environment.navigator?.clipboard ?? globalThis.navigator?.clipboard
  if (clipboard?.writeText !== undefined) {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Some in-app/webview browsers deny all programmatic clipboard writes.
    }
  }

  return false
}

function legacyCopyText(text: string, documentRef: ClipboardCopyEnvironment['document'] | undefined): boolean {
  if (copyViaClipboardEvent(text, documentRef)) {
    return true
  }
  if (documentRef?.body === undefined) {
    return false
  }

  const textarea = documentRef.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'

  documentRef.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return runLegacyCopyCommand(documentRef)
  } finally {
    documentRef.body.removeChild(textarea)
  }
}

function copyViaClipboardEvent(text: string, documentRef: ClipboardCopyEnvironment['document'] | undefined): boolean {
  if (documentRef === undefined) {
    return false
  }

  let copied = false
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', text)
    event.preventDefault()
    copied = true
  }

  documentRef.addEventListener('copy', onCopy)
  try {
    return runLegacyCopyCommand(documentRef) && copied
  } catch {
    return false
  } finally {
    documentRef.removeEventListener('copy', onCopy)
  }
}

function runLegacyCopyCommand(documentRef: ClipboardCopyEnvironment['document']): boolean {
  if (documentRef?.execCommand === undefined) {
    return false
  }
  return documentRef.execCommand('copy')
}
