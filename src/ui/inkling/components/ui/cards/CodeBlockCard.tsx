import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'

import { useKoenigComposerContext } from '@/ui/inkling/context/KoenigComposerContext'
import { darkBaseExtensions, lightBaseExtensions } from '@/ui/inkling/utils/codemirror-config'
import { cn } from '@/ui/lib/cn'

/**
 * Language → CodeMirror extension mapping.
 * Covers the languages we support for syntax highlighting in the editor.
 */
function getLanguageExtension(language: string | undefined) {
  const lang = (language ?? '').toLowerCase()
  if (
    lang === 'javascript' ||
    lang === 'js' ||
    lang === 'jsx' ||
    lang === 'typescript' ||
    lang === 'ts' ||
    lang === 'tsx'
  ) {
    return javascript({ typescript: lang.includes('ts') || lang.includes('type') })
  }
  if (lang === 'python' || lang === 'py') {
    return python()
  }
  if (lang === 'css' || lang === 'scss' || lang === 'less') {
    return css()
  }
  if (lang === 'html' || lang === 'xml' || lang === 'vue' || lang === 'svelte') {
    return html()
  }
  if (lang === 'markdown' || lang === 'md') {
    return markdown()
  }
  if (lang === 'sql' || lang === 'mysql' || lang === 'postgres' || lang === 'sqlite') {
    return sql()
  }
  return undefined
}

/**
 * CodeBlockCard — ported from Koenig's CodeBlockCard.jsx.
 *
 * Two modes:
 *   - Editing: CodeMirror editor with syntax highlighting + language input
 *   - Preview: read-only <pre><code> with the rendered code
 *
 * Removed from Koenig: CardCaptionEditor (we don't have code block captions).
 */
export function CodeBlockCard({
  code,
  language,
  isEditing,
  onCodeChange,
  onLanguageChange,
}: {
  code: string
  language: string
  isEditing: boolean
  onCodeChange: (code: string) => void
  onLanguageChange: (language: string) => void
}) {
  const { darkMode } = useKoenigComposerContext()

  const extensions = useMemo(() => {
    const base = darkMode ? darkBaseExtensions : lightBaseExtensions
    const langExt = getLanguageExtension(language)
    return langExt !== undefined ? [...base, langExt] : base
  }, [darkMode, language])

  if (isEditing) {
    return (
      <div className="relative w-full">
        {/* Language input — top right, overlay */}
        <input
          type="text"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          placeholder="language"
          className="absolute top-1 right-2 z-10 w-28 rounded border border-grey-300 bg-white px-2 py-0.5 text-[1.3rem] text-black dark:border-grey-900 dark:bg-grey-950 dark:text-white"
        />
        <CodeMirror
          value={code}
          onChange={onCodeChange}
          extensions={extensions}
          theme="none"
          className="inkling-codemirror"
          basicSetup={false}
        />
      </div>
    )
  }

  // Preview mode — read-only code block
  return (
    <pre className={cn('overflow-auto bg-grey-50 p-4 font-mono text-[1.6rem] leading-[2.25rem]', 'dark:bg-grey-950')}>
      <code className="text-grey-900 dark:text-grey-200">{code}</code>
    </pre>
  )
}
