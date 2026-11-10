import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger, root } from '@/server/infra/logger'
import { __resetLogSinkForTests, clearLogSink, pushLogLine, setLogSink, type LogSink } from '@/server/infra/logger/sink'

// The test env pins `server.loggingLevel: 'silent'`; raise the live pino level
// for the duration of each case so lines actually reach the writable.
const originalRootLevel = root.level

let stdoutSpy: MockInstance<typeof process.stdout.write> | undefined
let stdoutLines: string[] = []

beforeEach(() => {
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
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function stdoutText(): string {
  return stdoutLines.join('')
}

describe('log sink slot', () => {
  it('installs once into the empty process-wide slot', () => {
    const first: LogSink = { push: vi.fn() }
    const second: LogSink = { push: vi.fn() }

    expect(setLogSink(first)).toBe(true)
    expect(setLogSink(second)).toBe(false)

    expect(clearLogSink(second)).toBe(false)
    expect(clearLogSink(first)).toBe(true)
    // The cleared slot can be filled again.
    expect(setLogSink(second)).toBe(true)
  })

  it('installs and forwards in a production build — there is no build gate', () => {
    vi.stubEnv('DEV', false as never)
    vi.stubEnv('PROD', true as never)
    const sink: LogSink = { push: vi.fn() }

    expect(setLogSink(sink)).toBe(true)
    pushLogLine('{"level":"info","msg":"production"}\n')

    expect(sink.push).toHaveBeenCalledOnce()
    expect(sink.push).toHaveBeenCalledWith('{"level":"info","msg":"production"}\n')
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
