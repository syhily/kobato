/**
 * Temporary stubs while the hand-rolled editor is replaced by the vendored
 * inkling source (Task 1 of the vendor migration plan). Only the `instanceof`
 * guards and setter signatures used by `use-inkling-picker-actions.tsx` are
 * preserved; no Lexical node behaviour. The real schema-exact card nodes
 * return in Task 5.
 */
export class ImageCardNode {
  private payload: Record<string, unknown> = {}

  setSrc(value: string): void {
    this.payload.src = value
  }

  setAlt(value: string): void {
    this.payload.alt = value
  }

  setWidth(value: number | undefined): void {
    this.payload.width = value
  }

  setHeight(value: number | undefined): void {
    this.payload.height = value
  }

  setStoragePath(value: string | undefined): void {
    this.payload.storagePath = value
  }

  setImageId(value: unknown): void {
    this.payload.imageId = value
  }

  setThumbhash(value: string | undefined): void {
    this.payload.thumbhash = value
  }
}

export class MusicCardNode {
  private payload: Record<string, unknown> = {}

  setPlayerId(value: string): void {
    this.payload.playerId = value
  }
}
