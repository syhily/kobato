import { type RefObject, useEffect } from 'react'

import { LANGUAGE_MAP } from '@/ui/lib/code-languages'

const COPY_LABEL = 'Copy'
const COPIED_LABEL = 'Copied'
const FAILED_LABEL = 'Failed'
const RESET_DELAY = 1500

function languageLabel(language: string): string {
  const normalized = language.trim().toLowerCase()
  if (normalized === '') {
    return 'Text'
  }
  return LANGUAGE_MAP[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (legacyCopyText(text)) {
    return true
  }

  const clipboard = globalThis.navigator?.clipboard
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

function legacyCopyText(text: string): boolean {
  if (copyViaClipboardEvent(text)) {
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'

  document.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return runLegacyCopyCommand()
  } finally {
    document.body.removeChild(textarea)
  }
}

function copyViaClipboardEvent(text: string): boolean {
  let copied = false
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', text)
    event.preventDefault()
    copied = true
  }

  document.addEventListener('copy', onCopy)
  try {
    return runLegacyCopyCommand() && copied
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', onCopy)
  }
}

function runLegacyCopyCommand(): boolean {
  // eslint-disable-next-line ts/no-deprecated -- deliberate fallback for browsers without the async clipboard API
  if (typeof document.execCommand !== 'function') {
    return false
  }
  // eslint-disable-next-line ts/no-deprecated -- deliberate fallback for browsers without the async clipboard API
  return document.execCommand('copy')
}

// Exported code blocks ship as `pre > code[data-language][data-code]` with NO
// copy chrome (inkling exportDOM is static markup); this hook injects the
// header (language label + copy button) the PT-era `CodeBlock` component used
// to render. Chrome classes are plain CSS in tailwind.css — `src/client/**`
// is outside public.css's Tailwind `@source` scan.
export function useCodeCopyButtons(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const cleanups: (() => void)[] = []
    for (const code of container.querySelectorAll('pre > code[data-code]')) {
      const pre = code.parentElement
      const raw = code.getAttribute('data-code')
      if (pre === null || raw === null) {
        continue
      }
      // Idempotency: a re-run (same-route navigation) must not double-wrap.
      if (pre.parentElement?.classList.contains('code-block-wrapper') === true) {
        continue
      }

      const language = code.getAttribute('data-language') ?? 'text'
      const displayLanguage = languageLabel(language)

      const wrapper = document.createElement('div')
      wrapper.className = 'code-block-wrapper'

      const header = document.createElement('div')
      header.className = 'code-header'

      const label = document.createElement('span')
      label.className = 'language-label'
      label.setAttribute('aria-label', `Code language: ${displayLanguage}`)
      label.setAttribute('role', 'note')
      label.textContent = displayLanguage

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'copy-code'
      button.title = `Copy ${displayLanguage} code`
      button.setAttribute('aria-label', `Copy ${displayLanguage} code to clipboard`)
      button.textContent = COPY_LABEL

      let resetTimer: ReturnType<typeof setTimeout> | null = null
      const onClick = () => {
        if (resetTimer !== null) {
          clearTimeout(resetTimer)
        }
        void copyTextToClipboard(raw).then((copied) => {
          button.textContent = copied ? COPIED_LABEL : FAILED_LABEL
          resetTimer = setTimeout(() => {
            button.textContent = COPY_LABEL
          }, RESET_DELAY)
        })
      }
      button.addEventListener('click', onClick)
      cleanups.push(() => {
        button.removeEventListener('click', onClick)
        if (resetTimer !== null) {
          clearTimeout(resetTimer)
        }
      })

      header.append(label, button)
      pre.parentNode?.insertBefore(wrapper, pre)
      wrapper.append(header, pre)
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [containerRef])
}
