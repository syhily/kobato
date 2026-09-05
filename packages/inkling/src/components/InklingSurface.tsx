import React from 'react'

import type { InklingComposableEditorProps } from '@/components/InklingComposableEditor'

import InklingComposableEditor from '@/components/InklingComposableEditor'
import { SharedEditorStateContext } from '@/context/SharedEditorStateContext'

/**
 * InklingSurface — the composition rule for a top-level editor surface, made
 * exportable. Wrap the top-level editor tree in exactly one InklingSurface,
 * inside an InklingComposer; never render it inside a nested card composer.
 *
 * The surface owns the shared per-top-level-editor state (one undo stack and
 * the host's onChange), so every InklingComposableEditor below it — the
 * top-level one it renders and every nested card editor — behaves as one
 * document:
 * - Nested card edits join the top-level undo stack (skipped while collab is
 *   active; yjs owns undo/redo there).
 * - `onChange` is the shared handler: it fires for top-level and nested edits
 *   alike, always serialized from the top-level editor state. A composable
 *   editor may still take its own per-instance onChange for its local state.
 *
 * An InklingComposableEditor with no surface above it silently falls back to
 * a per-instance undo stack — composing through InklingSurface is what gives
 * a custom host surface the shipped surfaces' behaviour.
 */
export type InklingSurfaceProps = InklingComposableEditorProps

const InklingSurface = ({ onChange, children, ...props }: InklingSurfaceProps) => {
  return (
    <SharedEditorStateContext onChange={onChange}>
      <InklingComposableEditor {...props}>{children}</InklingComposableEditor>
    </SharedEditorStateContext>
  )
}

export default InklingSurface
