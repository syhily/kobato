interface DerivableCard {
  nodeType: string
  /** the declaration's markdown eligibility (`CardMarkdownSpec`); absent
   * means the card sits out the round-trip */
  markdown?: { kind: string }
}

/**
 * Derived-view helper for the card registries (plan 039) — the same runtime
 * reflection idiom as `getEditorCardNodes` (no codegen, no build step):
 * filters the card declarations to the markdown round-trip surface,
 * preserving declaration order.
 */
export function deriveCardNodes<T extends DerivableCard>(declarations: readonly T[]): T[] {
  return declarations.filter((declaration) => declaration.markdown)
}
