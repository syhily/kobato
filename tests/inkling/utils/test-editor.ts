import { createHeadlessEditor } from '@lexical/headless'
import { createEditor, type LexicalEditor } from 'lexical'

import { registerCardDecorateAdapter } from '@/inkling/nodes/decorate-card'

// Lexical reconciliation calls decorate(), which resolves through the
// injection port the `.` barrel fills in production. Register the adapter here
// so rendered-editor specs get production wiring without importing the barrel.
// This must stay a per-test-file import, NOT move into tests/inkling/setup.ts:
// setup files evaluate before a spec's hoisted vi.mock registrations, and
// pre-evaluating the component tree there defeats those mocks.
registerCardDecorateAdapter()

// The suite's shared editor harness. Bespoke editor configs (html import
// config, themes, parentEditor) keep their own createEditor calls.

type HeadlessEditorArgs = NonNullable<Parameters<typeof createHeadlessEditor>[0]>

type EditorUpdateOptions = Omit<NonNullable<Parameters<LexicalEditor['update']>[1]>, 'onUpdate'>

export interface CreateTestEditorOptions {
  nodes?: HeadlessEditorArgs['nodes']
  onError?: (error: Error) => void
  /** false for the rendered-component specs: a real editor (jsdom), namespace 'test'. */
  headless?: boolean
}

export function createTestEditor({ nodes = [], onError = () => {}, headless = true }: CreateTestEditorOptions = {}) {
  return headless ? createHeadlessEditor({ nodes, onError }) : createEditor({ namespace: 'test', nodes, onError })
}

/** Await one committed editor update; options (discrete, tag, …) pass through to editor.update. */
export function updateEditor(
  editor: LexicalEditor,
  updateFn: () => void,
  options?: EditorUpdateOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    editor.update(
      () => {
        try {
          updateFn()
        } catch (error) {
          // Lexical routes an updateFn throw to onError (often a no-op in
          // tests), and 0.52+ drops the pending update so onUpdate never
          // fires — reject so the spec fails fast with the real error
          // instead of hanging to the timeout.
          reject(error)
          throw error
        }
      },
      { ...options, onUpdate: () => resolve() },
    )
  })
}

/**
 * Vitest `it` body wrapper: runs testFn inside editor.update, rejecting on a
 * body-thrown error (otherwise an assertion failure surfaces only through
 * onError). The editor is read lazily through getEditor because `it` bodies are
 * collected before the spec's beforeEach assigns the editor.
 */
export function editorTest(getEditor: () => LexicalEditor, testFn: () => void | Promise<void>): () => Promise<void> {
  return function (): Promise<void> {
    return new Promise((resolve, reject) => {
      getEditor().update(() => {
        try {
          const result = testFn()
          Promise.resolve(result).then(resolve).catch(reject)
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}

/** One macrotask hop: flushes React effect registration and listener-enqueued work. */
export function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * Awaits the outer commit, then drains the listener-enqueued commit: work
 * scheduled from an update listener begins only after the outer commit's
 * deferred callbacks (the $triggerEnqueuedUpdates tail) and commits in a later
 * microtask, so the macrotask hop flushes both.
 */
export async function drainEnqueuedUpdates(
  editor: LexicalEditor,
  updateFn: () => void,
  options?: EditorUpdateOptions,
): Promise<void> {
  await updateEditor(editor, updateFn, options)
  await tick()
}
