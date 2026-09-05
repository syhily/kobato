import { createHeadlessEditor } from '@lexical/headless'
import { createEditor, type LexicalEditor } from 'lexical'

// The unit suite's editor harness — the one home of the test-editor
// factory and the update awaiters that used to be copied per spec:
//
// - createTestEditor: the two construction flavors (headless by default;
//   headless: false for the rendered-component specs that need a real
//   editor). Bespoke configs (html import config, themes, parentEditor)
//   keep their own createEditor calls — this factory owns only the
//   common nodes + onError shape.
// - updateEditor: await one committed update.
// - editorTest: the `it` body wrapper that runs the body inside
//   editor.update and rejects on a body-thrown error; async bodies
//   resolve/reject on the returned promise.
// - tick: one macrotask hop — the flush React effect registration and
//   listener-enqueued work need.
// - drainEnqueuedUpdates: the double hop — await the outer commit, then
//   one macrotask so a commit enqueued from the update listener (the
//   footnote renumber scan, registerUpdateScan) begins and lands.

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
  return new Promise<void>((resolve) => {
    editor.update(updateFn, { ...options, onUpdate: () => resolve() })
  })
}

/**
 * Vitest `it` body wrapper: runs testFn inside editor.update, resolving when
 * the body completes and rejecting on a body-thrown error (without the
 * try/catch, an assertion failure would surface only through onError). An
 * async body's returned promise is awaited — its continuations run after the
 * update callback returns, matching the per-spec copies this replaced. The
 * editor is read lazily through getEditor because `it` bodies are collected
 * before the spec's beforeEach assigns the editor.
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
 * deferred callbacks (Lexical's $triggerEnqueuedUpdates tail) and commits
 * in a later microtask, so the macrotask hop flushes both.
 */
export async function drainEnqueuedUpdates(
  editor: LexicalEditor,
  updateFn: () => void,
  options?: EditorUpdateOptions,
): Promise<void> {
  await updateEditor(editor, updateFn, options)
  await tick()
}
