import {
  registerHorizontalRuleInsert,
  registerHorizontalRuleScan,
} from '@kobato/inkling-internal/plugins/behaviour/horizontal-rule'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

export const HorizontalRulePlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => registerHorizontalRuleInsert(editor), [editor])
  useEffect(() => registerHorizontalRuleScan(editor), [editor])

  return null
}

export default HorizontalRulePlugin
