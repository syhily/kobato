import type {
  FootnoteDefinitionBlock,
  MusicPlayerBlock,
  NonRecursiveBlock,
  SolutionBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'
import type { MusicPlayerBlockMeta } from '@/shared/types/music'

// Request-scoped enrichment layer over the storage-pure wire schema
// (`@/shared/pt/schema`). The SSR prerender (`@/server/domains/pt/prerender`)
// attaches resolved music metadata to `musicPlayer` blocks in memory so the
// React renderer can paint without a client fetch. This shape is never
// authored, never accepted at the API perimeter, and never stored in
// `content.body` — which is why `meta` lives HERE and not on the schema.
// Every enriched type is a structural supertype of its wire twin, so a
// plain stored body is assignable anywhere an enriched one is expected.

/** `musicPlayer` block carrying SSR-resolved metadata. */
export type EnrichedMusicPlayerBlock = MusicPlayerBlock & { meta?: MusicPlayerBlockMeta }

export type EnrichedNonRecursiveBlock = Exclude<NonRecursiveBlock, MusicPlayerBlock> | EnrichedMusicPlayerBlock

export type EnrichedSolutionBlock = Omit<SolutionBlock, 'children'> & { children: EnrichedNonRecursiveBlock[] }

export type EnrichedTwoColumnBlock = Omit<TwoColumnBlock, 'left' | 'right'> & {
  left: EnrichedNonRecursiveBlock[]
  right: EnrichedNonRecursiveBlock[]
}

export type EnrichedFootnoteDefinitionBlock = Omit<FootnoteDefinitionBlock, 'children'> & {
  children: EnrichedNonRecursiveBlock[]
}

export type EnrichedBlock =
  | EnrichedNonRecursiveBlock
  | EnrichedSolutionBlock
  | EnrichedTwoColumnBlock
  | EnrichedFootnoteDefinitionBlock

export type EnrichedPortableTextBody = EnrichedBlock[]
