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
