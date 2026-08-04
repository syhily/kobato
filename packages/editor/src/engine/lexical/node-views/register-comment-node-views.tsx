import { InlineMathView } from '@kobato/editor/engine/lexical/node-views/inline-math-view'
import { MathBlockView } from '@kobato/editor/engine/lexical/node-views/math-block-view'
import { registerNodeView } from '@kobato/shared/lexical/node-views'
import { InlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import { MathBlockNode } from '@kobato/shared/lexical/nodes/math-block-node'

// Comment-editor decorator view registration (side-effect module) — the
// comment dialect's decorator subset only (inline math + display math),
// so the public comment-editor bundle never pulls the body-only views
// (image / music / footnote-ref). Import for side effect wherever the
// comment editor is created; registration is idempotent per node class.

registerNodeView(InlineMathNode, (props) => <InlineMathView {...props} />)
registerNodeView(MathBlockNode, (props) => <MathBlockView {...props} />)
