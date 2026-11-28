// @vitest-environment happy-dom

import type { InklingHostComposerProps } from '@kobato/inkling'

import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN'
import { emptyLexicalBody } from '@kobato/inkling/tests/utils/lexical'
import { renderWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PageBodyEditor } from '@/ui/editor/PageBodyEditor'
import { useKobatoInklingLabels } from '@/ui/shared/use-inkling-labels'

const composerProps: { current: InklingHostComposerProps | null } = { current: null }

vi.mock('@/ui/shared/use-inkling-labels', () => ({
  useKobatoInklingLabels: vi.fn(),
}))

vi.mock('@kobato/inkling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/inkling')>()
  return {
    ...actual,
    InklingEditor: () => null,
    InklingHostComposer: vi.fn((props: InklingHostComposerProps) => {
      composerProps.current = props
      return props.children
    }),
  }
})

function renderPageEditor() {
  renderWithI18n(<PageBodyEditor initialBody={emptyLexicalBody()} bodyKey="page-1" onBodyChange={() => {}} />, {
    locale: 'zh-CN',
  })
}

beforeEach(() => {
  composerProps.current = null
  vi.mocked(useKobatoInklingLabels).mockReturnValue(kobatoInklingLabelsZhCN)
})

describe('PageBodyEditor — root label table', () => {
  it('hands the root-loader label table to InklingHostComposer as labels', () => {
    renderPageEditor()
    expect(useKobatoInklingLabels).toHaveBeenCalledTimes(1)
    expect(composerProps.current?.labels).toBe(kobatoInklingLabelsZhCN)
  })
})
