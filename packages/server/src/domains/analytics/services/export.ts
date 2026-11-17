import type { ResolvedAnalyticsQuery } from '@kobato/contracts/analytics.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { queryExportRows } from '@kobato/db/duckdb/queries/export.ts'

const CSV_COLUMNS = ['path', 'views', 'visitors', 'referers'] as const

// Spreadsheet formula triggers: a cell starting (after leading TAB/CR/space) with
// = + - @ executes as a formula in Excel/LibreOffice — prefix it with a quote.
const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/

/** RFC 4180 cell escaping: quote values carrying a comma, quote, or newline. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CSV text export grouped by path: views, distinct visitors, distinct referer hosts. */
export async function queryExportCsv(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<string> {
  const rows = await queryExportRows(reader, input)
  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}
