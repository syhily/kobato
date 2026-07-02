import type { EditorState } from 'lexical'

import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useCallback, useEffect, useRef } from 'react'

import type { InklingBlockNode, InklingDocument, InklingFootnoteDefinitionNode } from '@/shared/inkling/schema'
import type { FootnoteDefinitionItem } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

import { removeOrphanFootnoteDefinitions, synchronizeInklingFootnoteIndices } from '@/shared/inkling/footnotes'
import { safeValidateInklingDocument } from '@/shared/inkling/schema'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

interface MergeFootnoteDefinitionsOptions {
  /** Parallel-state footnote definitions, owned by `InklingFootnoteProvider`.
   *  When provided, the editor's prose-only root is merged with these
   *  definitions to reconstruct the persisted document shape. */
  getDefinitions?: () => readonly FootnoteDefinitionItem[]
}

/**
 * Reconstruct the persisted document shape from the editor's prose-only state
 * plus the provider-owned footnote definitions. The editor tree never contains
 * `footnote-definition` blocks (they were stripped at read time); this function
 * appends them at the root tail, then canonicalises indices and drops orphans
 * so the output matches what renderers + migrate-pt expect.
 */
export function mergeFootnoteDefinitions(
  editorState: EditorState,
  options: MergeFootnoteDefinitionsOptions,
): InklingDocument {
  const proseDocument = editorStateToInklingDocument(editorState)
  const proseChildren = proseDocument.root.children as InklingBlockNode[]

  const definitions = options.getDefinitions?.() ?? []
  const definitionBlocks: InklingFootnoteDefinitionNode[] = definitions.map((d) => ({
    type: 'footnote-definition',
    version: 1,
    targetKey: d.targetKey,
    index: d.index,
    children: structuredClone(d.children),
  }))

  const merged: InklingDocument = {
    ...proseDocument,
    root: { ...proseDocument.root, children: [...proseChildren, ...definitionBlocks] },
  }

  // Canonicalise indices (first-reference order) and drop orphans in one
  // pass. `synchronizeInklingFootnoteIndices` also sorts definitions by index
  // and appends them after prose, which is exactly the persisted shape
  // renderers expect.
  const canonical = synchronizeInklingFootnoteIndices(merged).document
  return removeOrphanFootnoteDefinitions(canonical)
}

/**
 * Synchronously build a validated Inkling document from a Lexical editor
 * state, applying the same footnote-definition merge the debounced change
 * handler uses. Returns `null` when the resulting document fails schema
 * validation (the validation error is reported through the editor error
 * channel). Exposed so a parent shell can flush the latest in-flight edits
 * before a save/publish — the change plugin's own merge is debounced (120ms
 * trailing edge) and would otherwise be skipped if the user clicks save
 * inside that window, silently dropping the last edits (and, for article
 * mode, all footnote definitions which live only in the provider's parallel
 * state).
 */
export function buildInklingDocumentFromEditorState(
  editorState: EditorState,
  options: MergeFootnoteDefinitionsOptions,
): InklingDocument | null {
  const document = mergeFootnoteDefinitions(editorState, options)
  const validation = safeValidateInklingDocument(document)
  if (validation.ok) {
    return validation.document
  }
  reportEditorError(
    new Error(
      `Inkling document failed schema validation: ${validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    ),
    'serialize',
  )
  return null
}

export interface OnInklingDocumentChangePluginProps {
  /** Fired on every editor update with a validated Inkling document. */
  onChange: (document: InklingDocument) => void
  /** Parallel-state footnote definitions. When omitted, no footnote-merge
   *  runs (used by editors without footnotes, e.g. comment editor — though
   *  that path currently uses the raw `OnChangePlugin` directly). */
  getDefinitions?: () => readonly FootnoteDefinitionItem[]
  /** When provided, the plugin keeps this ref populated with a synchronous
   *  flush function so a parent shell can force the pending debounced merge
   *  to run immediately (used before save/publish to avoid losing the last
   *  120ms of edits). Cleared on unmount. */
  flushHandleRef?: React.RefObject<(() => InklingDocument | null) | null>
}

/**
 * Minimum delay (ms) between two merge+serialize passes. Without this, every
 * keystroke triggers a full `mergeFootnoteDefinitions` (serialize + per-
 * definition `structuredClone` + `synchronizeInklingFootnoteIndices` + schema
 * validate), which for long documents with many footnotes is O(footnotes ×
 * walk) per key. Coalescing into a trailing debounce still preserves
 * autosave's responsiveness (autosave itself debounces at a longer cadence
 * than this) while cutting the merge cost dramatically.
 */
const MERGE_DEBOUNCE_MS = 120

export function OnInklingDocumentChangePlugin({
  onChange,
  getDefinitions,
  flushHandleRef,
}: OnInklingDocumentChangePluginProps) {
  // Latest editor state captured by the trailing-edge debounce timer. We
  // store the immutable `EditorState` rather than the serialized document
  // so the debounce coalesces N keystrokes into one serialize pass rather
  // than N serialize + N debounce resets.
  const pendingEditorStateRef = useRef<EditorState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep `onChange` / `getDefinitions` refs so the debounce timer (allocated
  // once) always invokes the latest callback without re-arming on every
  // parent render.
  const onChangeRef = useRef(onChange)
  const getDefinitionsRef = useRef(getDefinitions)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    getDefinitionsRef.current = getDefinitions
  }, [getDefinitions])

  // Run the merge for the latest captured editor state and fire onChange.
  const flush = useCallback(() => {
    timerRef.current = null
    const editorState = pendingEditorStateRef.current
    if (editorState === null) {
      return
    }
    pendingEditorStateRef.current = null
    const document = mergeFootnoteDefinitions(editorState, { getDefinitions: getDefinitionsRef.current })
    const validation = safeValidateInklingDocument(document)
    if (validation.ok) {
      onChangeRef.current(validation.document)
    } else {
      // Schema validation failed — the editor produced a document that does
      // not satisfy the Inkling contract. We must NOT swallow this silently:
      // otherwise `onChange` never fires, autosave stalls, and the user sees
      // a healthy editor while their content is never persisted. Surface the
      // error so it shows up in telemetry / dev console, then bail (we can't
      // safely persist an invalid document).
      reportEditorError(
        new Error(
          `Inkling document failed schema validation: ${validation.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        ),
        'serialize',
      )
    }
  }, [])

  // Expose a synchronous flush to the parent shell via `flushHandleRef`.
  // Unlike the debounced `flush` above, this variant runs regardless of
  // whether a pending timer is armed, because save/publish must capture the
  // editor's *current* state — not the last state captured at debounce time.
  // It returns the document so the caller can use it directly for the
  // mutation (React state `setBody` would be async and not yet reflected in
  // the persist callback's closure).
  useEffect(() => {
    if (flushHandleRef === undefined) {
      return
    }
    const handle = (): InklingDocument | null => {
      // Clear the pending debounce so we don't double-fire: the flushed
      // document supersedes anything the timer would have produced.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const editorState = pendingEditorStateRef.current
      pendingEditorStateRef.current = null
      if (editorState === null) {
        return null
      }
      const document = buildInklingDocumentFromEditorState(editorState, {
        getDefinitions: getDefinitionsRef.current,
      })
      if (document !== null) {
        onChangeRef.current(document)
      }
      return document
    }
    flushHandleRef.current = handle
    return () => {
      if (flushHandleRef.current === handle) {
        flushHandleRef.current = null
      }
    }
  }, [flushHandleRef])

  // Cancel any pending flush on unmount so we don't fire onChange after the
  // editor is gone.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      pendingEditorStateRef.current = null
    }
  }, [])

  const handleChange = useCallback(
    (editorState: EditorState) => {
      // Capture the latest immutable editor state and (re)arm a trailing
      // debounce. Coalescing rapid updates (typing, IME composition bursts,
      // history-merged renumber commits) into a single merge pass is what
      // keeps the per-keystroke cost bounded.
      pendingEditorStateRef.current = editorState
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(flush, MERGE_DEBOUNCE_MS)
    },
    [flush],
  )

  return (
    <OnChangePlugin
      onChange={handleChange}
      // Selection-only updates never change document content, so skip them
      // at the plugin boundary rather than running our debounce only to
      // throw away a no-op merge. We do NOT set `ignoreHistoryMergeTagChange`
      // because the footnote renumber commits (ART-3) are tagged
      // `history-merge` but carry real content changes (ref index rewrites)
      // that must reach the persisted document.
      ignoreSelectionChange
    />
  )
}
