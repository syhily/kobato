import type { InklingComposerProps } from '@kobato/inkling'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'
import type { ComponentProps } from 'react'

import { THEME_COOKIE } from '@kobato/base/utils/theme-cookie'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { CommentBodyEditor } from '@kobato/inkling/comment/CommentBodyEditor'
import { COMMENT_EDITOR_NODES } from '@kobato/inkling/comment/editor/comment-editor-nodes'
import { EMPTY_COMMENT_EDITOR_STATE } from '@kobato/inkling/headless/comment-schema'
import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { stubMatchMedia } from '@kobato/inkling/tests/utils/stub-match-media'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { render } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const composerProps: { current: InklingComposerProps | null } = { current: null }

vi.mock('@kobato/inkling-internal/components/InklingComposer', () => ({
  default: vi.fn((props: InklingComposerProps) => {
    composerProps.current = props
    return props.children
  }),
}))

vi.mock('@kobato/inkling-internal/components/InklingSurface', () => ({
  default: () => <div data-testid="surface" />,
}))

const LABELS = { 'placeholder.editor': 'HOST labels' }

function renderEditor(props: Partial<ComponentProps<typeof CommentBodyEditor>> = {}) {
  render(
    wrapWithI18n(
      <ThemeProvider>
        <CommentBodyEditor initialBody={EMPTY_COMMENT_EDITOR_STATE} bodyKey="c1" onBodyChange={() => {}} {...props} />
      </ThemeProvider>,
      { locale: 'zh-CN' },
    ),
  )
}

function nodeTypes(body: unknown): string[] {
  const types: string[] = []
  visitLexicalNodes(unsafeCast<CommentEditorState>(body), (node) => {
    types.push(node.type)
  })
  return types.sort()
}

beforeAll(stubMatchMedia)

beforeEach(() => {
  composerProps.current = null
  localStorage.clear()
})

describe('CommentBodyEditor — host constants', () => {
  it('binds the active locale, the resolved theme, and the trimmed node set to the composer', () => {
    renderEditor()
    expect(composerProps.current?.nodes).toBe(COMMENT_EDITOR_NODES)
    expect(composerProps.current?.isEmojiEnabled).toBe(false)
    expect(composerProps.current?.codeEditor).toBe('plain')
    expect(composerProps.current?.wordCountLanguage).toBe('zh-CN')
    expect(composerProps.current?.emojiLocale).toBe('zh')
    expect(composerProps.current?.darkMode).toBe(false)
    expect(composerProps.current?.labels).toBeUndefined()
  })

  it('passes the host labels through untouched', () => {
    renderEditor({ labels: LABELS })
    expect(composerProps.current?.labels).toBe(LABELS)
  })

  it('flips darkMode with the resolved theme', () => {
    localStorage.setItem(THEME_COOKIE, 'dark')
    renderEditor()
    expect(composerProps.current?.darkMode).toBe(true)
  })
})

describe('CommentBodyEditor — seed', () => {
  it('seeds the composer with the validated body and its legacy math downgraded', () => {
    renderEditor({
      initialBody: unsafeCast<CommentEditorState>({
        root: {
          type: 'root',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'math', version: 1, tex: 'x^2', mathml: '', svg: '' }],
        },
      }),
    })
    const seeded = composerProps.current?.initialEditorState
    expect(nodeTypes(seeded)).toContain('codeblock')
    expect(nodeTypes(seeded)).not.toContain('math')
  })

  it('falls back to the empty comment state when the stored body is invalid', () => {
    renderEditor({ initialBody: unsafeCast<CommentEditorState>({ root: { type: 'root', version: 1 } }) })
    expect(composerProps.current?.initialEditorState).toBe(EMPTY_COMMENT_EDITOR_STATE)
  })
})
