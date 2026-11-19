import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

type BaseNodeEntry = { getType?: () => string; replace?: { getType?: () => string } }

function nodeTypeOf(entry: unknown): string | undefined {
  const klass = unsafeCast<BaseNodeEntry>(entry)
  if (typeof klass.getType === 'function') {
    return klass.getType()
  }
  const replace = klass.replace
  return replace !== undefined && typeof replace.getType === 'function' ? replace.getType() : undefined
}

export function excludeBaseNodes<TEntry>(nodes: readonly TEntry[], excludedTypes: ReadonlySet<string>): TEntry[] {
  return nodes.filter((entry) => {
    const type = nodeTypeOf(entry)
    return type === undefined || !excludedTypes.has(type)
  })
}
