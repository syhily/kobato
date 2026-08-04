import type { LexicalEditor } from 'lexical'

/**
 * Decorator-node view registry — the shared↔editor seam for the React
 * views of the custom decorator nodes (image / inline-math / math-block /
 * music-player / footnote-ref).
 *
 * The node classes live in `@kobato/shared` (the headless canonicalizer /
 * validator and the editor share them), but their React views belong to
 * the editor package and shared stays React-free: `decorate()` resolves
 * the view through this registry instead of importing it. The editor
 * engine registers the renderers by node class at startup
 * (`packages/editor/src/engine/lexical/node-views/register-node-views.tsx`);
 * without a registration (headless / SSR / non-React tests) `decorate()`
 * renders nothing (`null`).
 *
 * The renderer value type is deliberately opaque (`unknown`): the registry
 * crosses the package boundary, and the concrete React element type is the
 * editor layer's concern. `DecoratorNode<unknown>` satisfies lexical's
 * runtime contract — the React bindings (`@lexical/react`'s
 * `useDecorators`) consume the value untyped.
 */

export interface NodeViewProps<N> {
  node: N
  editor: LexicalEditor
}

export type NodeViewRenderer<N> = (props: NodeViewProps<N>) => unknown

/** Constructor type of a node class — lets `registerNodeView` infer the node type. */
export type NodeViewNodeClass<N> = abstract new (...args: never[]) => N

const rendererByNodeClass = new WeakMap<object, NodeViewRenderer<unknown>>()

/** Register (or replace) the view renderer for a decorator node class. */
export function registerNodeView<N>(nodeClass: NodeViewNodeClass<N>, renderer: NodeViewRenderer<N>): void {
  // The stored renderer erases the node type (the registry key is the
  // class object); `renderNodeView` re-casts per call.
  // eslint-disable-next-line ts/no-unsafe-type-assertion
  rendererByNodeClass.set(nodeClass, renderer as unknown as NodeViewRenderer<unknown>)
}

/**
 * Resolve the registered renderer for a node class and render it with
 * `{ node, editor }`. Returns `null` when no renderer is registered —
 * the headless / SSR default.
 */
export function renderNodeView(nodeClass: object, node: unknown, editor: LexicalEditor): unknown {
  const renderer = rendererByNodeClass.get(nodeClass)
  return renderer === undefined ? null : renderer({ node, editor })
}
