import type {
  FootnoteDefinitionBlock,
  MusicPlayerBlock,
  NonRecursiveBlock,
  SolutionBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'
import type { MusicPlayerBlockMeta } from '@/shared/types/music'

// Request-scoped enrichment layer over the storage-pure wire schema:
// the SSR prerender attaches resolved music metadata to `musicPlayer`
// blocks in memory. Never authored, accepted at the API perimeter, or
// stored — which is why `meta` lives HERE, not on the schema.

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
