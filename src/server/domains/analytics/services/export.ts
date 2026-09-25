import { sql } from 'kysely'

import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { ResolvedAnalyticsQuery } from '@/shared/contracts/analytics'

import { visitAggregates } from '@/server/domains/analytics/services/aggregates'
import { createAnalyticsQuery, runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { buildAnalyticsFilter } from '@/server/domains/analytics/services/query-filter'

const CSV_COLUMNS = ['path', 'views', 'visitors', 'referers'] as const

interface ExportRow {
  path?: string
  views?: number
  visitors?: number
  referers?: number
}

// Spreadsheet formula triggers: a cell whose first character (after leading
// TAB/CR/space) is = + - @ executes as a formula in Excel/LibreOffice — prefix it.
const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/

/**
 * RFC 4180 cell escaping: quote when the value carries a comma, quote, or
 * newline; neutralize formula-triggering prefixes with a leading `'`.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CSV text export grouped by path: views, distinct visitors, distinct referer hosts. */
export async function queryExportCsv(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<string> {
  const rows = (await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([sql.ref('blob1').as('path'), ...visitAggregates('views')])
      .where(buildAnalyticsFilter(input))
      .groupBy('path')
      .orderBy('views', 'desc')
      // The wire schema already clamps `limit` to ≤500.
      .limit(input.limit ?? 500),
  )) as ExportRow[]

  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}
