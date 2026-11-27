import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'

import { loadPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import { CommentBodyEditor } from '@kobato/inkling/comment/CommentBodyEditor'
import { lexicalBodyWith } from '@kobato/inkling/tests/utils/lexical'
import { stubMatchMedia } from '@kobato/inkling/tests/utils/stub-match-media'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { render, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

const CODE_BLOCK = {
  type: 'codeblock',
  version: 1,
  code: 'const answer = 42',
  language: 'typescript',
  caption: '',
  highlightedHtml: '',
}

const LEGACY_MATH_BLOCK = { type: 'math', version: 1, tex: 'x^2', mathml: '', svg: '' }

function commentBodyWithCards(): CommentEditorState {
  return unsafeCast<CommentEditorState>(lexicalBodyWith([CODE_BLOCK, LEGACY_MATH_BLOCK]))
}

function renderCommentEditor() {
  return render(
    wrapWithI18n(
      <ThemeProvider>
        <CommentBodyEditor initialBody={commentBodyWithCards()} bodyKey="comment-1" onBodyChange={() => {}} />
      </ThemeProvider>,
      { locale: 'zh-CN' },
    ),
  )
}

beforeAll(async () => {
  stubMatchMedia()
  await loadPasteDialect()
})

describe('CommentBodyEditor — card rendering through the comment entry alone', () => {
  it('renders a code block and a legacy math block as code blocks without the React barrel', async () => {
    const { container } = renderCommentEditor()

    await waitFor(() => expect(container.querySelectorAll('[data-inkling-card="codeblock"]')).toHaveLength(2))
    expect(container.querySelector('.border-red')).toBeNull()
    expect(container.textContent).not.toContain('An error was thrown.')
  })
})
