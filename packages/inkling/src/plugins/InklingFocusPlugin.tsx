import { InklingEditorEventPlugin } from '@kobato/inkling-internal/plugins/InklingEditorEventPlugin'
import { FOCUS_COMMAND } from 'lexical'

export const InklingFocusPlugin = ({ onFocus }: { onFocus?: () => void }) => (
  <InklingEditorEventPlugin command={FOCUS_COMMAND} onEvent={onFocus} />
)
