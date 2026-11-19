import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useWordCountHandle } from '@kobato/inkling-internal/context/WordCountHandleContext'
import { publishWordCountCallback } from '@kobato/inkling-internal/plugins/behaviour/word-count-handle'
import { createWordCounter, type WordCounter } from '@kobato/inkling-internal/plugins/behaviour/word-counter'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

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
