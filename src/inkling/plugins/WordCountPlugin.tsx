import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { useWordCountHandle } from '@/inkling/context/WordCountHandleContext'
import { createWordCounter, type WordCounter } from '@/inkling/plugins/behaviour/word-counter'
import { publishWordCountCallback } from '@/inkling/plugins/behaviour/wordCountHandle'

// `language` selects the Intl.Segmenter word-granularity path in countWords;
// with no language the counter keeps Inkling's regex path (never an implicit
// English segmenter), so a host that names nothing keeps regex-based counts.
// It is published on the composer handle alongside the callbacks so nested
// composers count with the same language — the top-level-only publish gate
// lives in publishWordCountCallback beside the handle. The explicit prop wins
// over the composer's `wordCountLanguage` (the host's UI locale).
//
// `onSelectionChange` is the optional selection channel: it receives the
// active selection's word count (0 is valid), or null while nothing is
// selected. A selection-only mount (`onSelectionChange` without `onChange`)
// skips the full-document counting pass entirely.
//
// The two channels run independent counters so changing the selection
// callback recreates only the selection counter — the document counter and its
// full-document pass are untouched. Language changes call `setLanguage` on
// both live counters instead of rebuilding them. All channels publish through
// one effect: the handle's per-channel ownership stacks make concurrent
// publishes and replacements independent.
export const WordCountPlugin = ({
  onChange,
  onSelectionChange,
  language,
}: {
  onChange?: (count: number) => void
  onSelectionChange?: (count: number | null) => void
  language?: string
} = {}) => {
  const [editor] = useLexicalComposerContext()
  const wordCountHandle = useWordCountHandle()
  const { wordCountLanguage } = React.useContext(InklingUiPrefsContext)
  const resolvedLanguage = language ?? wordCountLanguage

  const documentCounterRef = React.useRef<WordCounter | null>(null)
  const selectionCounterRef = React.useRef<WordCounter | null>(null)
  const languageRef = React.useRef(resolvedLanguage)

  // Declared first so the ref is current when either mount effect constructs
  // its counter. Language swaps keep counter identity.
  React.useLayoutEffect(() => {
    languageRef.current = resolvedLanguage
    documentCounterRef.current?.setLanguage(resolvedLanguage)
    selectionCounterRef.current?.setLanguage(resolvedLanguage)
  }, [resolvedLanguage])

  React.useLayoutEffect(() => {
    if (!onChange) {
      return
    }

    const counter = createWordCounter({ editor, onChange, language: languageRef.current })
    documentCounterRef.current = counter
    counter.attach()
    return () => {
      counter.detach()
      documentCounterRef.current = null
    }
  }, [editor, onChange])

  React.useLayoutEffect(() => {
    if (!onSelectionChange) {
      return
    }

    const counter = createWordCounter({ editor, onSelectionChange, language: languageRef.current })
    selectionCounterRef.current = counter
    counter.attach()
    return () => {
      counter.detach()
      selectionCounterRef.current = null
    }
  }, [editor, onSelectionChange])

  React.useLayoutEffect(() => {
    if (!onChange && !onSelectionChange && resolvedLanguage === undefined) {
      return
    }

    return publishWordCountCallback(wordCountHandle, editor, {
      onChange,
      onSelectionChange,
      language: resolvedLanguage ?? null,
    })
  }, [editor, onChange, onSelectionChange, resolvedLanguage, wordCountHandle])
  return null
}

export default WordCountPlugin
