import { registerCardDecorateAdapter } from '@kobato/inkling-internal/nodes/decorate-card'
import { createHeadlessEditor } from '@lexical/headless'
import { createEditor, type LexicalEditor } from 'lexical'

registerCardDecorateAdapter()

type HeadlessEditorArgs = NonNullable<Parameters<typeof createHeadlessEditor>[0]>

type EditorUpdateOptions = Omit<NonNullable<Parameters<LexicalEditor['update']>[1]>, 'onUpdate'>

export interface CreateTestEditorOptions {
  nodes?: HeadlessEditorArgs['nodes']
  onError?: (error: Error) => void

  headless?: boolean
}

export function createTestEditor({ nodes = [], onError = () => {}, headless = true }: CreateTestEditorOptions = {}) {
  return headless ? createHeadlessEditor({ nodes, onError }) : createEditor({ namespace: 'test', nodes, onError })
}

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
          reject(error)
          throw error
        }
      },
      { ...options, onUpdate: () => resolve() },
    )
  })
}

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

export function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

export async function drainEnqueuedUpdates(
  editor: LexicalEditor,
  updateFn: () => void,
  options?: EditorUpdateOptions,
): Promise<void> {
  await updateEditor(editor, updateFn, options)
  await tick()
}
