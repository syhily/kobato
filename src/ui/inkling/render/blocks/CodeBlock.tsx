import { type ReactNode } from 'react'

import type { InklingCodeBlockNode } from '@/shared/inkling/schema'

import { CodeBlock as CodeBlockComponent } from '@/ui/inkling/render/components/CodeBlock'

export function CodeBlock({ node }: { node: InklingCodeBlockNode }): ReactNode {
  // `highlightedHtml` is already server-sanitized via `sanitizeShikiHtml`
  // (src/server/render/inkling/sanitize.ts) before it is persisted on the
  // node. No client-side re-sanitization — see
  // docs/superpowers/specs/2026-06-22-sanitizer-migration-design.md §"Why
  // sites 1–4 drop the client-side call entirely".
  if (node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    return (
      <CodeBlockComponent
        className={node.language !== undefined ? `language-${node.language}` : undefined}
        copyText={node.code}
        data-language={node.language}
        dangerouslySetInnerHTML={{ __html: node.highlightedHtml }}
      />
    )
  }
  return (
    <CodeBlockComponent>
      <code
        className={node.language !== undefined ? `language-${node.language}` : undefined}
        data-language={node.language}
      >
        {node.code}
      </code>
    </CodeBlockComponent>
  )
}
