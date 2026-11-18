import { InklingEditorEventPlugin } from '@kobato/inkling-internal/plugins/InklingEditorEventPlugin'
import { BLUR_COMMAND } from 'lexical'

export const InklingBlurPlugin = ({ onBlur }: { onBlur?: () => void }) => (
  <InklingEditorEventPlugin command={BLUR_COMMAND} onEvent={onBlur} />
)
