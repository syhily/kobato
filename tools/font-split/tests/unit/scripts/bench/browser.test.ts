import type { Browser } from '@playwright/test'

import { relaunchingOnLoss } from '@kobato/font-split/scripts/bench/browser'
import { describe, expect, it, vi } from 'vitest'

const lost = (): Error =>
  new Error('page.goto: Target page, context or browser has been closed\nCall log:\n  - navigating')
const fakeBrowser = (): Browser => ({ close: vi.fn(async () => undefined) }) as unknown as Browser

describe('bench browser', () => {
  it('relaunches the browser when it was lost and repeats the work', async () => {
    const first = fakeBrowser()
    const second = fakeBrowser()
    const launch = vi.fn(async () => second)
    const run = vi.fn().mockRejectedValueOnce(lost()).mockResolvedValueOnce('measured')
    const log = vi.fn()
    const outcome = await relaunchingOnLoss(log, first, run, launch)
    expect(outcome.browser).toBe(second)
    expect(outcome.value).toBe('measured')
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1]).toEqual([second])
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(launch).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      'the browser went away (page.goto: Target page, context or browser has been closed) — relaunching, attempt 2 of 3',
    )
  })

  it('does not retry any other failure', async () => {
    const browser = fakeBrowser()
    const launch = vi.fn()
    const run = vi.fn().mockRejectedValue(new Error('page.goto: Timeout 30000ms exceeded'))
    await expect(relaunchingOnLoss(vi.fn(), browser, run, launch)).rejects.toThrow(/Timeout/)
    expect(run).toHaveBeenCalledTimes(1)
    expect(launch).not.toHaveBeenCalled()
  })

  it('gives up after three attempts', async () => {
    const browsers = [fakeBrowser(), fakeBrowser(), fakeBrowser()]
    const launch = vi.fn().mockResolvedValueOnce(browsers[1]!).mockResolvedValueOnce(browsers[2]!)
    const run = vi.fn().mockRejectedValue(lost())
    await expect(relaunchingOnLoss(vi.fn(), browsers[0]!, run, launch)).rejects.toThrow(/has been closed/)
    expect(run).toHaveBeenCalledTimes(3)
    expect(launch).toHaveBeenCalledTimes(2)
  })
})
