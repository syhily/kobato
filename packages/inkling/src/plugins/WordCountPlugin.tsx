import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useWordCountHandle } from '@kobato/inkling-internal/context/WordCountHandleContext'
import { publishWordCountCallback } from '@kobato/inkling-internal/plugins/behaviour/word-count-handle'
import { createWordCounter, type WordCounter } from '@kobato/inkling-internal/plugins/behaviour/word-counter'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useContext, useLayoutEffect, useRef } from 'react'
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
  const { wordCountLanguage } = useContext(InklingUiPrefsContext)
  const resolvedLanguage = language ?? wordCountLanguage
  const documentCounterRef = useRef<WordCounter | null>(null)
  const selectionCounterRef = useRef<WordCounter | null>(null)
  const languageRef = useRef(resolvedLanguage)
  useLayoutEffect(() => {
    languageRef.current = resolvedLanguage
    documentCounterRef.current?.setLanguage(resolvedLanguage)
    selectionCounterRef.current?.setLanguage(resolvedLanguage)
  }, [resolvedLanguage])

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
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
