import type { MenuItem } from '@/nodes/cards/card-menu-build'

import { resolveCardFacts } from '@/nodes/cards/card-facts'
import { resolveCardMenuEntries } from '@/nodes/cards/card-menus'

/**
 * Resolves a card's menu entries by node type — the test-side home of what
 * used to be `getCardMenu` in `@/nodes/cards/card-menus`. The built-in-first /
 * host-fallback merge lives in `@/nodes/cards/card-facts`.
 */
export function getCardMenu(nodeType: string): MenuItem[] | undefined {
  const facts = resolveCardFacts(nodeType)
  return facts === undefined ? undefined : resolveCardMenuEntries(facts)
}
