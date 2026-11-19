export function initialSlot(itemCount: number): number {
  return itemCount > 0 ? 1 : 0
}

export function nextSlot(slot: number, itemCount: number): number {
  return (slot + 1) % (itemCount + 1)
}

export function previousSlot(slot: number, itemCount: number): number {
  return (slot + itemCount) % (itemCount + 1)
}

export function slotToItemIndex(slot: number): number {
  return slot - 1
}
