import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { vi } from 'vitest'

export function mockComposerContext(editor: LexicalEditor) {
  vi.mocked(useLexicalComposerContext).mockReturnValue([editor, { getTheme: () => null }])
}
