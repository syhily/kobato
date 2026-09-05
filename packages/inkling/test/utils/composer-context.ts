import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { vi } from 'vitest'

// Centralizes the LexicalComposerContext tuple shape so a Lexical upgrade
// touches one file. Each test file still needs its own hoisted
// vi.mock('@lexical/react/LexicalComposerContext', ...) block — vitest
// hoisting is per-file; this helper only owns the tuple.
export function mockComposerContext(editor: LexicalEditor) {
  vi.mocked(useLexicalComposerContext).mockReturnValue([editor, { getTheme: () => null }])
}
