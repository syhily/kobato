import type { InitialConfigType } from '@lexical/react/LexicalComposer'

import InklingComposerBase, {
  type InklingComposerProps as InklingComposerBaseProps,
  type InklingInitialEditorState,
} from '@/components/InklingComposerBase'
import DEFAULT_NODES from '@/nodes/DefaultNodes'

export type { InklingInitialEditorState }

/**
 * The full-entry composer (`.`): identical to the core variant
 * (`@/components/InklingComposerBase`) except `nodes` defaults to the full
 * DEFAULT_NODES card set. The core entry exports the base under the same
 * `InklingComposer` name with `nodes` required.
 */
export interface InklingComposerProps extends Omit<InklingComposerBaseProps, 'nodes'> {
  nodes?: InitialConfigType['nodes']
}

const InklingComposer = ({ nodes = [...DEFAULT_NODES], ...props }: InklingComposerProps) => {
  return <InklingComposerBase nodes={nodes} {...props} />
}

export default InklingComposer
