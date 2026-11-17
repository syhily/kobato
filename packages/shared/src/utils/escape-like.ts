/** Escapes LIKE wildcard characters (`%`, `_`) and the escape character (`\`) so user input is treated as literal text. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
