import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger, root } from '@/server/infra/logger'
import { __resetLogSinkForTests, clearLogSink, pushLogLine, setLogSink, type LogSink } from '@/server/infra/logger/sink'

const runtimeEnv = import.meta.env as unknown as Record<string, unknown>
const originalDev = runtimeEnv.DEV
const originalProd = runtimeEnv.PROD
// The test env pins `server.loggingLevel: 'silent'`; raise the live pino level
// for the duration of each case so lines actually reach the writable.
const originalRootLevel = root.level

function setRuntime(dev: boolean, prod: boolean): void {
  runtimeEnv.DEV = dev
  runtimeEnv.PROD = prod
}

let stdoutSpy: MockInstance<typeof process.stdout.write> | undefined
let stdoutLines: string[] = []

beforeEach(() => {
  setRuntime(true, false)
  __resetLogSinkForTests()
  root.level = 'debug'
  stdoutLines = []
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdoutLines.push(String(chunk))
    return true
  }) as typeof process.stdout.write)
})

afterEach(() => {
  vi.useRealTimers()
  __resetLogSinkForTests()
  root.level = originalRootLevel
  stdoutSpy?.mockRestore()
  stdoutSpy = undefined
  runtimeEnv.DEV = originalDev
  runtimeEnv.PROD = originalProd
  vi.restoreAllMocks()
})

function stdoutText(): string {
  return stdoutLines.join('')
}

describe('log sink slot', () => {
  it('installs once in the development runtime', () => {
    const first: LogSink = { push: vi.fn() }
    const second: LogSink = { push: vi.fn() }

    expect(setLogSink(first)).toBe(true)
    expect(setLogSink(second)).toBe(false)

    expect(clearLogSink(second)).toBe(false)
    expect(clearLogSink(first)).toBe(true)
    // The cleared slot can be filled again.
    expect(setLogSink(second)).toBe(true)
  })

  it('refuses installation in a production runtime', () => {
    setRuntime(false, true)
    const sink: LogSink = { push: vi.fn() }

    expect(setLogSink(sink)).toBe(false)
    pushLogLine('{"level":"info","msg":"no sink"}\n')

    expect(sink.push).not.toHaveBeenCalled()
  })

  it('refuses installation when DEV and PROD are both set', () => {
    setRuntime(true, true)
    expect(setLogSink({ push: vi.fn() })).toBe(false)
  })

  it('does nothing when no sink is installed', () => {
    expect(() => pushLogLine('{"level":"info"}\n')).not.toThrow()
    expect(stdoutText()).toBe('')
  })

  it('drops direct re-entrant pushLogLine calls', () => {
    const received: string[] = []
    setLogSink({
      push: (line) => {
        received.push(line)
        pushLogLine('nested')
      },
    })

    pushLogLine('outer')

    expect(received).toEqual(['outer'])
  })
})

describe('logger writable forwarding', () => {
  it('writes the identical serialized line to stdout and to the sink', () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z'), toFake: ['Date'] })

    logger.info('sink parity', { requestId: 'req-1' })
    const before = stdoutText()
    expect(before).not.toBe('')

    stdoutLines = []
    const sink: LogSink = { push: vi.fn() }
    expect(setLogSink(sink)).toBe(true)

    logger.info('sink parity', { requestId: 'req-1' })
    const after = stdoutText()

    expect(after).toBe(before)
    expect(sink.push).toHaveBeenCalledTimes(1)
    expect(sink.push).toHaveBeenCalledWith(after)
  })

  it('isolates a throwing sink from stdout and the logger caller', () => {
    const sink: LogSink = {
      push: vi.fn(() => {
        throw new Error('sink exploded')
      }),
    }
    expect(setLogSink(sink)).toBe(true)

    expect(() => logger.warn('still logged', { scope: 'sink-test' })).not.toThrow()
    expect(stdoutText()).toContain('"msg":"still logged"')

    expect(() => logger.warn('logged again')).not.toThrow()
    expect(sink.push).toHaveBeenCalledTimes(2)
    expect(stdoutText()).toContain('"msg":"logged again"')
  })

  it('drops re-entrant lines without recursing', () => {
    const received: string[] = []
    const sink: LogSink = {
      push: (line) => {
        received.push(line)
        logger.info('re-entrant')
      },
    }
    expect(setLogSink(sink)).toBe(true)

    expect(() => logger.info('outer')).not.toThrow()

    expect(received).toHaveLength(1)
    expect(received[0]).toContain('"msg":"outer"')
    // The re-entrant line still reaches stdout; only its sink hop is dropped.
    expect(stdoutText().match(/"msg":"re-entrant"/g)).toHaveLength(1)

    // The fence is released, so the next top-level line is forwarded again.
    logger.info('after re-entry')
    expect(received).toHaveLength(2)
    expect(received[1]).toContain('"msg":"after re-entry"')
  })
})
