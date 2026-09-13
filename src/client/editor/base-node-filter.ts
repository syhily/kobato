// The one exclusion filter both composer node manifests
// (`page-editor-nodes`, `comment-editor-nodes`) run over EDITOR_BASE_NODES.
// The base run mixes node classes (static getType) with node-replacement
// pair configs (`{ replace: Class, with }`) — a pair entry carries no static
// getType of its own, so its type is read off the pair's `replace` class.
// The unsafeCast that reads getType() off the mixed entries lives ONLY in
// this module (the typed `nodeTypeOf` helper), keeping the manifests
// cast-free.

import { unsafeCast } from '@/shared/utils/unsafe-cast'

type BaseNodeEntry = { getType?: () => string; replace?: { getType?: () => string } }

function nodeTypeOf(entry: unknown): string | undefined {
  const klass = unsafeCast<BaseNodeEntry>(entry)
  if (typeof klass.getType === 'function') {
    return klass.getType()
  }
  const replace = klass.replace
  return replace !== undefined && typeof replace.getType === 'function' ? replace.getType() : undefined
}

/** Drops every EDITOR_BASE_NODES entry whose own type (or, for a replacement
 *  pair, the replaced type) lands in `excludedTypes`. Entries carrying no
 *  discoverable type are kept. */
export function excludeBaseNodes<TEntry>(nodes: readonly TEntry[], excludedTypes: ReadonlySet<string>): TEntry[] {
  return nodes.filter((entry) => {
    const type = nodeTypeOf(entry)
    return type === undefined || !excludedTypes.has(type)
  })
}
