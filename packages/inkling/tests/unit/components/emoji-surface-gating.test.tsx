import InklingCaptionEditor from '@kobato/inkling-internal/components/InklingCaptionEditor'
import InklingComposer from '@kobato/inkling-internal/components/InklingComposer'
import InklingNestedEditor from '@kobato/inkling-internal/components/InklingNestedEditor'
import { render, screen } from '@testing-library/react'
import { createEditor, type LexicalEditor } from 'lexical'
import React from 'react'
import { afterAll, describe, expect, it, vi } from 'vitest'

const ink_plugins_EmojiPickerPlugin = await import('@kobato/inkling-internal/plugins/EmojiPickerPlugin')
vi.spyOn(ink_plugins_EmojiPickerPlugin, 'EmojiPickerPlugin').mockImplementation((() => (
  <div data-testid="emoji-picker-plugin" />
)) as never)
vi.spyOn(ink_plugins_EmojiPickerPlugin, 'default').mockImplementation((() => (
  <div data-testid="emoji-picker-plugin" />
)) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

function createNestedEditor(): LexicalEditor {
  return createEditor({ namespace: 'nested', nodes: [], onError: () => {} })
}

describe('emoji surface gating (isEmojiEnabled)', () => {
  it('InklingNestedEditor mounts the emoji typeahead by default', () => {
    render(
      <InklingComposer>
        <InklingNestedEditor initialEditor={createNestedEditor()} />
      </InklingComposer>,
    )

    expect(screen.queryByTestId('emoji-picker-plugin')).not.toBeNull()
  })

  it('InklingNestedEditor omits the emoji typeahead when isEmojiEnabled is false', () => {
    render(
      <InklingComposer isEmojiEnabled={false}>
        <InklingNestedEditor initialEditor={createNestedEditor()} />
      </InklingComposer>,
    )

    expect(screen.queryByTestId('emoji-picker-plugin')).toBeNull()
  })

  it('InklingCaptionEditor mounts the emoji typeahead by default', () => {
    render(
      <InklingComposer>
        <InklingCaptionEditor captionEditor={createNestedEditor()} />
      </InklingComposer>,
    )

    expect(screen.queryByTestId('emoji-picker-plugin')).not.toBeNull()
  })

  it('InklingCaptionEditor omits the emoji typeahead when isEmojiEnabled is false', () => {
    render(
      <InklingComposer isEmojiEnabled={false}>
        <InklingCaptionEditor captionEditor={createNestedEditor()} />
      </InklingComposer>,
    )

    expect(screen.queryByTestId('emoji-picker-plugin')).toBeNull()
  })
})
