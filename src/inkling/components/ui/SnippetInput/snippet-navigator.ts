/**
 * The snippet menu's headless navigator (round 3, C7): one slot ring
 * replacing the paired `isCreateButtonActive`/`activeMenuItem` state. Slot 0
 * is the create button, slots 1..itemCount are the filtered snippets, and
 * the arrow keys walk the ring in both directions.
 */

/** Where the highlight starts for a fresh query: the first item, or the create button when nothing matches. */
export function initialSlot(itemCount: number): number {
  return itemCount > 0 ? 1 : 0
}

/** ArrowDown: walk toward the last item, then wrap to the create button. */
export function nextSlot(slot: number, itemCount: number): number {
  return (slot + 1) % (itemCount + 1)
}

/** ArrowUp: walk toward the create button, then wrap to the last item. */
export function previousSlot(slot: number, itemCount: number): number {
  return (slot + itemCount) % (itemCount + 1)
}

/** The Dropdown's item index for a slot, or -1 when the create button is active. */
export function slotToItemIndex(slot: number): number {
  return slot - 1
}
