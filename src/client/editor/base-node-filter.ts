// The one exclusion filter both composer node manifests run over EDITOR_BASE_NODES.
// The base run mixes node classes with node-replacement pair configs
// (`{ replace: Class, with }`); a pair carries no static getType, so its type is
// read off the pair's `replace` class. The unsafeCast lives only in this module.

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

/** Drops entries whose type (or, for a replacement pair, the replaced type) is in `excludedTypes`. */
export function excludeBaseNodes<TEntry>(nodes: readonly TEntry[], excludedTypes: ReadonlySet<string>): TEntry[] {
  return nodes.filter((entry) => {
    const type = nodeTypeOf(entry)
    return type === undefined || !excludedTypes.has(type)
  })
}
