import { BLUR_COMMAND } from 'lexical'

import { InklingEditorEventPlugin } from '@/inkling/plugins/InklingEditorEventPlugin'

export const InklingBlurPlugin = ({ onBlur }: { onBlur?: () => void }) => (
  <InklingEditorEventPlugin command={BLUR_COMMAND} onEvent={onBlur} />
)
