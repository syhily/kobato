import { render, screen } from '@testing-library/react'
import { createEditor, type LexicalEditor } from 'lexical'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import InklingCaptionEditor from '@/inkling/components/InklingCaptionEditor'
import InklingComposer from '@/inkling/components/InklingComposer'
import InklingNestedEditor from '@/inkling/components/InklingNestedEditor'

// The gate under test is whether the nested/caption editors MOUNT the emoji
// typeahead — the plugin is mocked to a sentinel so no emoji-mart chunk loads.
vi.mock('@/inkling/plugins/EmojiPickerPlugin', () => ({
  EmojiPickerPlugin: () => <div data-testid="emoji-picker-plugin" />,
  default: () => <div data-testid="emoji-picker-plugin" />,
}))

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
