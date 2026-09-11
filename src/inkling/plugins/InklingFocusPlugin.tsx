import { FOCUS_COMMAND } from 'lexical'

import { InklingEditorEventPlugin } from '@/inkling/plugins/InklingEditorEventPlugin'

export const InklingFocusPlugin = ({ onFocus }: { onFocus?: () => void }) => (
  <InklingEditorEventPlugin command={FOCUS_COMMAND} onEvent={onFocus} />
)
