import { describe, expect, it } from 'vitest'

import {
  dateToLocalInputValue,
  futureLocalInputValueOrEmpty,
  localInputValueToIso,
  parseLocalDateTimeInput,
} from '@/ui/admin/editor-shell/editor-datetime'

const LOCAL_VALUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

describe('ui/admin/editor-shell/editor-datetime — dateToLocalInputValue', () => {
  it('pads every component to two digits', () => {
    const value = dateToLocalInputValue(new Date(2026, 0, 2, 3, 4))
    expect(value).toBe('2026-01-02T03:04')
  })
})

describe('ui/admin/editor-shell/editor-datetime — parseLocalDateTimeInput', () => {
  it('maps empty and whitespace input to the null no-value sentinel', () => {
    expect(parseLocalDateTimeInput('')).toBeNull()
    expect(parseLocalDateTimeInput('   ')).toBeNull()
    expect(parseLocalDateTimeInput('not-a-date')).toBeNull()
  })

  it('parses a local picker value into a Date in the local zone', () => {
    expect(parseLocalDateTimeInput('2026-06-01T12:00')?.getTime()).toBe(Date.parse('2026-06-01T12:00'))
  })
})

describe('ui/admin/editor-shell/editor-datetime — localInputValueToIso', () => {
  it('maps empty and unparseable input to the null no-value sentinel', () => {
    expect(localInputValueToIso('')).toBeNull()
    expect(localInputValueToIso('not-a-date')).toBeNull()
  })

  it('round-trips with dateToLocalInputValue', () => {
    const iso = localInputValueToIso('2026-06-01T12:00')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(dateToLocalInputValue(new Date(iso!))).toBe('2026-06-01T12:00')
  })
})

describe('ui/admin/editor-shell/editor-datetime — futureLocalInputValueOrEmpty', () => {
  it('keeps a future instant as a local input value', () => {
    const value = futureLocalInputValueOrEmpty('2099-06-01T09:00:00.000Z')
    expect(value).toMatch(LOCAL_VALUE_RE)
    expect(Date.parse(value)).toBe(Date.parse('2099-06-01T09:00:00.000Z'))
  })

  it('clears a past instant — a past publishedAt is a fact, not a schedule', () => {
    expect(futureLocalInputValueOrEmpty('2020-06-01T09:00:00.000Z')).toBe('')
  })

  it('clears unparseable input', () => {
    expect(futureLocalInputValueOrEmpty('garbage')).toBe('')
  })
})
