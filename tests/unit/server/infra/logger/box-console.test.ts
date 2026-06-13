import { describe, expect, it, vi } from 'vitest'

import { boxLog } from '@/server/infra/logger/box-console'

describe('infra/logger/box-console — boxLog', () => {
  it('prints a single-line box in double style by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    boxLog('hello')
    const out = spy.mock.calls[0]![0] as string
    expect(out).toContain('╗')
    expect(out).toContain('hello')
    spy.mockRestore()
  })

  it('prints a multi-line box with padding', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    boxLog(['line one', 'line two'])
    const out = spy.mock.calls[0]![0] as string
    expect(out).toContain('line one')
    expect(out).toContain('line two')
    expect(out.split('\n').length).toBeGreaterThanOrEqual(4)
    spy.mockRestore()
  })

  it('supports single / round / bold styles', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    for (const style of ['single', 'round', 'bold'] as const) {
      boxLog('x', { style })
      const out = spy.mock.calls.at(-1)![0] as string
      expect(out).toMatch(/[┌╭┏]/)
    }
    spy.mockRestore()
  })

  it('renders the title in the top border when supplied', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    boxLog('body', { title: 'INFO' })
    const out = spy.mock.calls[0]![0] as string
    expect(out).toContain('INFO')
    spy.mockRestore()
  })

  it('right-aligns content when align: right', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    boxLog(['short', 'a much longer line'], { align: 'right' })
    const out = spy.mock.calls[0]![0] as string
    const rows = out.split('\n')
    const shortRow = rows[1]!
    const longRow = rows[2]!
    expect(shortRow.indexOf('short')).toBeGreaterThan(longRow.indexOf('a much longer line'))
    spy.mockRestore()
  })

  it('center-aligns content when align: center', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    boxLog(['short', 'a much longer line'], { align: 'center' })
    const out = spy.mock.calls[0]![0] as string
    const rows = out.split('\n')
    const shortRow = rows[1]!
    const longRow = rows[2]!
    expect(shortRow.indexOf('short')).toBeGreaterThan(longRow.indexOf('a much longer line'))
    spy.mockRestore()
  })
})
