import { type ReactNode } from 'react'

import type { InklingCodeBlockNode } from '@/shared/inkling/schema'

import { sanitizeHtml } from '@/ui/lib/sanitize-html'
import { CodeBlock as CodeBlockComponent } from '@/ui/pt/blocks/CodeBlock'

export function CodeBlock({ node }: { node: InklingCodeBlockNode }): ReactNode {
  if (node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    return (
      <CodeBlockComponent
        className={node.language !== undefined ? `language-${node.language}` : undefined}
        copyText={node.code}
        data-language={node.language}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.highlightedHtml, 'shiki') }}
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
