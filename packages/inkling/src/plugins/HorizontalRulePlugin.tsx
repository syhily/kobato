import {
  registerHorizontalRuleInsert,
  registerHorizontalRuleScan,
} from '@kobato/inkling-internal/plugins/behaviour/horizontal-rule'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

// The insert surgery, the scan guards, and the registration guards live in
// @kobato/inkling-internal/plugins/behaviour/horizontal-rule (no-ops when the card is not
// registered); this plugin is the React adapter that mounts them.
export const HorizontalRulePlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => registerHorizontalRuleInsert(editor), [editor])
  useEffect(() => registerHorizontalRuleScan(editor), [editor])

  return null
}

export default HorizontalRulePlugin
