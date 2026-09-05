import { MarkdownShortcutPlugin as LexicalMarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import InklingComposer from '@/components/InklingComposer'
import InklingEditor from '@/components/InklingEditor'
import InklingSurface from '@/components/InklingSurface'
import { DEFAULT_TRANSFORMERS } from '@/markdown/transformers'
import { MINIMAL_TRANSFORMERS } from '@/markdown/transformers-core'
import MINIMAL_NODES from '@/nodes/MinimalNodes'
import MarkdownShortcutPlugin from '@/plugins/MarkdownShortcutPlugin'

vi.mock('@lexical/react/LexicalMarkdownShortcutPlugin', () => ({
  MarkdownShortcutPlugin: vi.fn(() => null),
}))

// plan C5: MarkdownShortcutPlugin's default is the card-free MINIMAL set;
// InklingEditor pins the full DEFAULT set explicitly so the `.` surface's
// shortcut behaviour is unchanged.

function lastTransformersArg() {
  const calls = vi.mocked(LexicalMarkdownShortcutPlugin).mock.calls
  return calls[calls.length - 1]?.[0]?.transformers
}

describe('MarkdownShortcutPlugin', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to MINIMAL_TRANSFORMERS', () => {
    MarkdownShortcutPlugin()

    expect(lastTransformersArg()).toEqual(MINIMAL_TRANSFORMERS)
    expect(lastTransformersArg()).not.toEqual(DEFAULT_TRANSFORMERS)
  })

  it('forwards an explicit transformer set untouched', () => {
    MarkdownShortcutPlugin({ transformers: DEFAULT_TRANSFORMERS })

    expect(lastTransformersArg()).toEqual(DEFAULT_TRANSFORMERS)
  })
})

describe('InklingEditor markdown shortcut defaults', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('mounts DEFAULT_TRANSFORMERS on the full-editor surface', () => {
    // the `.` configuration: InklingComposer defaults to DEFAULT_NODES, which
    // the feature plugins InklingEditor mounts rely on
    render(
      <InklingComposer>
        <InklingEditor />
      </InklingComposer>,
    )

    expect(lastTransformersArg()).toEqual(DEFAULT_TRANSFORMERS)
  })

  it('mounts MINIMAL_TRANSFORMERS on a bare InklingSurface', () => {
    render(
      <InklingComposer nodes={MINIMAL_NODES}>
        <InklingSurface />
      </InklingComposer>,
    )

    expect(lastTransformersArg()).toEqual(MINIMAL_TRANSFORMERS)
  })
})
