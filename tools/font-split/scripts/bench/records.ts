export interface BenchRecord {
  event: string
  values: Record<string, string>
}

const PAIR = /^[A-Za-z][A-Za-z0-9]*([.][A-Za-z][A-Za-z0-9]*)*=/
const EVENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export function parseRecordLine(line: string): BenchRecord | null {
  const tab = line.indexOf('\t')
  if (tab === -1) {
    return null
  }
  const head = line.slice(0, tab)
  const event = head.slice(head.lastIndexOf(' ') + 1)
  const pairs = line.slice(tab + 1).split('\t')
  if (!EVENT.test(event) || pairs.some((pair) => !PAIR.test(pair))) {
    return null
  }
  const values: Record<string, string> = {}
  for (const pair of pairs) {
    const separator = pair.indexOf('=')
    values[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
  return { event, values }
}

export function parseRecords(output: string): BenchRecord[] {
  return output.split('\n').flatMap((line) => {
    const record = parseRecordLine(line.trimEnd())
    return record === null ? [] : [record]
  })
}

export function recordsOf(output: string, event?: string): BenchRecord[] {
  return parseRecords(output).filter((record) => event === undefined || record.event === event)
}

export function recordString(record: BenchRecord, key: string): string {
  const value = record.values[key]
  if (value === undefined) {
    throw new Error(`bench record "${record.event}" has no ${key}`)
  }
  return value
}

export function recordNumber(record: BenchRecord, key: string): number {
  const raw = recordString(record, key)
  const value = Number(raw)
  if (raw === '' || !Number.isFinite(value)) {
    throw new Error(`bench record "${record.event}" has a non-numeric ${key}: ${raw}`)
  }
  return value
}

export function selectRecords(
  records: readonly BenchRecord[],
  event: string,
  match: Readonly<Record<string, string>>,
): BenchRecord[] {
  return records.filter(
    (record) => record.event === event && Object.entries(match).every(([key, value]) => record.values[key] === value),
  )
}

export function theRecord(
  records: readonly BenchRecord[],
  event: string,
  match: Readonly<Record<string, string>>,
): BenchRecord {
  const found = selectRecords(records, event, match)
  if (found.length !== 1) {
    throw new Error(`expected exactly one "${event}" record for ${JSON.stringify(match)}, found ${found.length}`)
  }
  return found[0]!
}
