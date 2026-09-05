import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { useWordCountHandle } from '@/context/WordCountHandleContext'
import { createWordCounter } from '@/plugins/behaviour/word-counter'
import { publishWordCountCallback } from '@/plugins/behaviour/wordCountHandle'

// `language` selects the Intl.Segmenter word-granularity path in countWords;
// without Segmenter the counter falls back
// to the regex path. It is published on the composer handle alongside
// onChange so nested composers count with the same language — the
// top-level-only publish gate lives in publishWordCountCallback beside the
// handle (mirroring registerTkNodeTracking).
export const WordCountPlugin = ({
  onChange,
  language = 'en',
}: { onChange?: (count: number) => void; language?: string } = {}) => {
  const [editor] = useLexicalComposerContext()
  const wordCountHandle = useWordCountHandle()

  React.useLayoutEffect(() => {
    if (!onChange) {
      return
    }

    const unpublish = publishWordCountCallback(wordCountHandle, editor, { onChange, language })

    const counter = createWordCounter({ editor, onChange, language })
    counter.attach()

    return () => {
      counter.detach()
      unpublish()
    }
  }, [editor, onChange, language, wordCountHandle])
  return null
}

export default WordCountPlugin
