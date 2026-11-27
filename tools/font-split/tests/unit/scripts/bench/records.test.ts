import {
  parseRecordLine,
  parseRecords,
  recordNumber,
  recordString,
  recordsOf,
  selectRecords,
  theRecord,
} from '@kobato/font-split/scripts/bench/records'
import { describe, expect, it } from 'vitest'

const LINE = 'test harness ... page-cost\tlabel=blog\tlambda=55000\tmu=500\tchunks=707\tcold.meanBytes=1778066'

describe('bench records', () => {
  it('parses a tab-separated record behind the test-harness prefix', () => {
    expect(parseRecordLine(LINE)).toEqual({
      event: 'page-cost',
      values: { label: 'blog', lambda: '55000', mu: '500', chunks: '707', 'cold.meanBytes': '1778066' },
    })
  })

  it('ignores prose and malformed lines', () => {
    expect(parseRecordLine('page-cost report [blog]: 707 chunks')).toBeNull()
    expect(parseRecordLine('page-cost\tlabel=blog\t=novalue')).toBeNull()
    expect(parseRecordLine('')).toBeNull()
  })

  it('collects the records of one event from a captured run', () => {
    const records = recordsOf(
      [
        'running 1 test',
        LINE,
        'page-cost\tlabel=hans\tchunks=69',
        'page-cost-size\tlabel=blog\tband=<300\tpages=40',
      ].join('\n'),
      'page-cost',
    )
    expect(records.map((record) => record.values.label)).toEqual(['blog', 'hans'])
    expect(recordsOf(LINE)).toHaveLength(1)
  })

  it('selects by event and field values and demands exactly one match', () => {
    const records = parseRecords([LINE, 'page-cost\tlabel=hans\tchunks=69'].join('\n'))
    expect(selectRecords(records, 'page-cost', { label: 'blog' })).toHaveLength(1)
    expect(selectRecords(records, 'page-cost', { label: 'wiki' })).toHaveLength(0)
    expect(theRecord(records, 'page-cost', { label: 'hans' }).values.chunks).toBe('69')
    expect(() => theRecord(records, 'page-cost', { label: 'wiki' })).toThrow(/found 0/)
    expect(() => theRecord(records, 'page-cost', {})).toThrow(/found 2/)
  })

  it('reads typed values and fails loudly on missing or non-numeric fields', () => {
    const record = parseRecordLine(LINE)!
    expect(recordNumber(record, 'cold.meanBytes')).toBe(1_778_066)
    expect(recordString(record, 'label')).toBe('blog')
    expect(() => recordString(record, 'missing')).toThrow(/has no missing/)
    expect(() => recordNumber(parseRecordLine('page-cost\tlabel=blog')!, 'chunks')).toThrow()
  })
})
