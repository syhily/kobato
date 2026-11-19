// Kobato's host-card layer: the editor-side assemblies of the product's cards.
// Loading this entry registers every host card (`defineCard` runs at module
// scope) and exposes the image node + the music card's base class for the host's
// pick-seam glue. A load-bearing module entry, NOT a general barrel — extend it
// only with new host-card assemblies.

export { KobatoImageNode, isKobatoImageNode } from '@kobato/inkling-internal/host-cards/kobato-image-node.ts'
export {
  BaseMusicPlayerNode,
  isMusicPlayerCardNode,
  musicCardToolbarItems,
  type MusicPlayerCardNode,
  MusicPlayerCardComponent,
  musicPlayerCard,
} from '@kobato/inkling-internal/host-cards/music-player.tsx'
export { BaseSolutionNode, solutionCard, SolutionCardView } from '@kobato/inkling-internal/host-cards/solution.tsx'
export {
  BaseTwoColumnNode,
  twoColumnCard,
  TwoColumnCardView,
  TwoColumnPaneView,
} from '@kobato/inkling-internal/host-cards/two-column.tsx'
export { inklingHostCardMatches } from '@kobato/inkling-internal/host-cards/menu-matches.ts'
