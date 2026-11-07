import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { useWordCountHandle } from '@/inkling/context/WordCountHandleContext'
import { createWordCounter } from '@/inkling/plugins/behaviour/word-counter'
import { publishWordCountCallback } from '@/inkling/plugins/behaviour/wordCountHandle'

// `language` selects the Intl.Segmenter word-granularity path in countWords;
// without Segmenter the counter falls back
// to the regex path. It is published on the composer handle alongside
// onChange so nested composers count with the same language — the
// top-level-only publish gate lives in publishWordCountCallback beside the
// handle (mirroring registerTkNodeTracking). The explicit prop wins over the
// composer's `wordCountLanguage` (the host's UI locale); `en` is the last
// fallback for hosts that never name a locale.
export const WordCountPlugin = ({
  onChange,
  language,
}: { onChange?: (count: number) => void; language?: string } = {}) => {
  const [editor] = useLexicalComposerContext()
  const wordCountHandle = useWordCountHandle()
  const { wordCountLanguage } = React.useContext(InklingUiPrefsContext)
  const resolvedLanguage = language ?? wordCountLanguage ?? 'en'

  React.useLayoutEffect(() => {
    if (!onChange) {
      return
    }

    const unpublish = publishWordCountCallback(wordCountHandle, editor, {
      onChange,
      language: resolvedLanguage,
    })

    const counter = createWordCounter({ editor, onChange, language: resolvedLanguage })
    counter.attach()

    return () => {
      counter.detach()
      unpublish()
    }
  }, [editor, onChange, resolvedLanguage, wordCountHandle])
  return null
}

export default WordCountPlugin
