import type { MenuItem } from '@/inkling/nodes/cards/card-menu-build'

import { resolveCardFacts } from '@/inkling/nodes/cards/card-facts'
import { resolveCardMenuEntries } from '@/inkling/nodes/cards/card-menus'

/**
 * Test-side card menu by node type: built-in declarations first, host registry
 * as the fallback (the merge lives in `@/inkling/nodes/cards/card-facts`).
 */
export function getCardMenu(nodeType: string): MenuItem[] | undefined {
  const facts = resolveCardFacts(nodeType)
  return facts === undefined ? undefined : resolveCardMenuEntries(facts)
}
