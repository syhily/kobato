import { FootnoteRefView } from '@kobato/editor/engine/lexical/node-views/footnote-ref-view'
import { ImageView } from '@kobato/editor/engine/lexical/node-views/image-view'
import { InlineMathView } from '@kobato/editor/engine/lexical/node-views/inline-math-view'
import { MathBlockView } from '@kobato/editor/engine/lexical/node-views/math-block-view'
import { MusicPlayerView } from '@kobato/editor/engine/lexical/node-views/music-player-view'
import { registerNodeView } from '@kobato/shared/lexical/node-views'
import { FootnoteRefNode } from '@kobato/shared/lexical/nodes/footnote-ref-node'
import { ImageNode } from '@kobato/shared/lexical/nodes/image-node'
import { InlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import { MathBlockNode } from '@kobato/shared/lexical/nodes/math-block-node'
import { MusicPlayerNode } from '@kobato/shared/lexical/nodes/music-player-node'

// Body-editor decorator-node view registration (side-effect module).
//
// The custom decorator nodes live in `@kobato/shared` and resolve their
// React views through the shared node-view registry (`@kobato/shared/
// lexical/node-views`) — the node classes themselves carry no React
// import. This module is the body editor's wiring: it maps every body
// decorator node class to its React view so `decorate()` renders
// in-editor. Import it for side effect wherever the body editor is
// created (the comment editor registers its narrower subset via
// `register-comment-node-views`); headless / SSR consumers never
// register and `decorate()` falls back to `null`.
//
// Registration is idempotent per node class (the registry is a
// class-keyed WeakMap; a later registration replaces the earlier one).

registerNodeView(FootnoteRefNode, (props) => <FootnoteRefView {...props} />)
registerNodeView(ImageNode, (props) => <ImageView {...props} />)
registerNodeView(InlineMathNode, (props) => <InlineMathView {...props} />)
registerNodeView(MathBlockNode, (props) => <MathBlockView {...props} />)
registerNodeView(MusicPlayerNode, (props) => <MusicPlayerView {...props} />)
