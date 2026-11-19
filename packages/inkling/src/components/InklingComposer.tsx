import type { CreateEditorArgs } from 'lexical'

import InklingComposerBase, {
  type InklingComposerProps as InklingComposerBaseProps,
  type InklingInitialEditorState,
} from '@kobato/inkling-internal/components/InklingComposerBase'
import DEFAULT_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'

export type { InklingInitialEditorState }

export interface InklingComposerProps extends Omit<InklingComposerBaseProps, 'nodes'> {
  nodes?: CreateEditorArgs['nodes']
}
const InklingComposer = ({ nodes = [...DEFAULT_NODES], ...props }: InklingComposerProps) => {
  return <InklingComposerBase nodes={nodes} {...props} />
}

export default InklingComposer
