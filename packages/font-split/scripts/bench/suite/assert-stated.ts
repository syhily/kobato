const UNSTATED = /\bNaN\b|\bundefined\b|\bInfinity\b/

export function assertStated(subject: string, text: string): void {
  const match = UNSTATED.exec(text)
  if (match !== null) {
    throw new Error(`the ${subject} carries ${match[0]} — the results hold a value it cannot state`)
  }
}
