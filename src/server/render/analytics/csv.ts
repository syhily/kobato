function escapeCsvField(value: string | number): string {
  const str = String(value)
  const needsDefuse = /^[=+\-@\t\r]/.test(str)
  const defused = needsDefuse ? `'${str}` : str
  if (defused.includes(',') || defused.includes('"') || defused.includes('\n')) {
    return `"${defused.replace(/"/g, '""')}"`
  }
  return defused
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','))
  }
  return lines.join('\n') + '\n'
}
