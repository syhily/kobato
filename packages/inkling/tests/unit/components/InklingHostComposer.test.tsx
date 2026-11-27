import type { AppLocale } from '@kobato/i18n/locales'
import type { InklingComposerProps } from '@kobato/inkling'
import type { ComponentProps } from 'react'

import { InklingHostComposer } from '@kobato/inkling'
import { emptyLexicalBody } from '@kobato/inkling/tests/utils/lexical'
import { stubMatchMedia } from '@kobato/inkling/tests/utils/stub-match-media'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { THEME_COOKIE } from '@kobato/utils/theme-cookie'
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const composerProps: { current: InklingComposerProps | null } = { current: null }

vi.mock('@kobato/inkling-internal/components/InklingComposer', () => ({
  default: vi.fn((props: InklingComposerProps) => {
    composerProps.current = props
    return props.children
  }),
}))

type ComposerProps = ComponentProps<typeof InklingHostComposer>

function renderComposer(props: Partial<ComposerProps> = {}, locale: AppLocale = 'zh-CN') {
  render(
    wrapWithI18n(
      <ThemeProvider>
        <InklingHostComposer nodes={[]} initialEditorState={emptyLexicalBody()} {...props}>
          <div data-testid="surface-child" />
        </InklingHostComposer>
      </ThemeProvider>,
      { locale },
    ),
  )
}

beforeAll(stubMatchMedia)

beforeEach(() => {
  composerProps.current = null
  localStorage.clear()
})

describe('InklingHostComposer — host constants', () => {
  it('binds the active locale and the resolved theme, and leaves absent labels to the composer defaults', () => {
    renderComposer()
    expect(composerProps.current?.wordCountLanguage).toBe('zh-CN')
    expect(composerProps.current?.emojiLocale).toBe('zh')
    expect(composerProps.current?.darkMode).toBe(false)
    expect(composerProps.current?.labels).toBeUndefined()
  })

  it('switches the word-count language and the emoji locale with the locale', () => {
    renderComposer({}, 'en-US')
    expect(composerProps.current?.wordCountLanguage).toBe('en-US')
    expect(composerProps.current?.emojiLocale).toBe('en')

    renderComposer({}, 'zh-HK')
    expect(composerProps.current?.wordCountLanguage).toBe('zh-HK')
    expect(composerProps.current?.emojiLocale).toBe('zh-hant')
  })

  it('flips darkMode with the resolved theme', () => {
    localStorage.setItem(THEME_COOKIE, 'dark')
    renderComposer()
    expect(composerProps.current?.darkMode).toBe(true)
  })

  it('passes the explicit host labels through untouched', () => {
    const labels = { 'placeholder.editor': 'HOST labels' }
    renderComposer({ labels })
    expect(composerProps.current?.labels).toBe(labels)
  })

  it('forwards the node set, seed, ui-prefs flags, host integration, and the surface child untouched', () => {
    const nodes = [] as NonNullable<ComposerProps['nodes']>
    const seed = emptyLexicalBody()
    const fileUploader = vi.fn() as never
    const cardConfig = { image: { captionEnabled: true } } as never
    renderComposer({
      nodes,
      initialEditorState: seed,
      fileUploader,
      cardConfig,
      isEmojiEnabled: false,
      codeEditor: 'plain',
      dragScrollContainerSelector: '[data-kobato-editor-scroll]',
    })
    expect(composerProps.current?.nodes).toBe(nodes)
    expect(composerProps.current?.initialEditorState).toBe(seed)
    expect(composerProps.current?.fileUploader).toBe(fileUploader)
    expect(composerProps.current?.cardConfig).toBe(cardConfig)
    expect(composerProps.current?.isEmojiEnabled).toBe(false)
    expect(composerProps.current?.codeEditor).toBe('plain')
    expect(composerProps.current?.dragScrollContainerSelector).toBe('[data-kobato-editor-scroll]')
    expect(screen.getByTestId('surface-child')).toBeInTheDocument()
  })
})
