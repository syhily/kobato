/**
 * The math family's artifact-priority rule (kobato pt-html.ts:150-154,
 * 254-265): a server-prerendered SVG wins over MathML, which wins over the
 * TeX source fallback. Shared by the block card's renderer, the inline node's
 * export, and both editor previews so the priority is defined exactly once.
 * Inkling never runs KaTeX (CSP) — the artifacts are filled host-side and
 * only carried here.
 */
export interface MathArtifactData {
  tex: string
  mathml: string
  svg: string
}

export interface MathArtifact {
  kind: 'svg' | 'mathml'
  html: string
}

export function resolveMathArtifact({ mathml, svg }: MathArtifactData): MathArtifact | null {
  if (svg) {
    return { kind: 'svg', html: svg }
  }
  if (mathml) {
    return { kind: 'mathml', html: mathml }
  }
  return null
}
