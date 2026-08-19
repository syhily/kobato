import { describe, expect, it } from 'vitest'

import { parseConfigArg } from '@/server/infra/config-arg'

describe('infra/config-arg — parseConfigArg', () => {
  it('returns undefined when no config flag is present', () => {
    expect(parseConfigArg([])).toBeUndefined()
    expect(parseConfigArg(['--smoke-natives'])).toBeUndefined()
  })

  it('parses the --config <path> form', () => {
    expect(parseConfigArg(['--config', '/tmp/x.json'])).toBe('/tmp/x.json')
  })

  it('parses the -c <path> short form', () => {
    expect(parseConfigArg(['-c', '/tmp/x.json'])).toBe('/tmp/x.json')
  })

  it('parses the --config=<path> form', () => {
    expect(parseConfigArg(['--config=/tmp/x.json'])).toBe('/tmp/x.json')
  })

  it('honors the first occurrence', () => {
    expect(parseConfigArg(['--config', '/tmp/a.json', '--config', '/tmp/b.json'])).toBe('/tmp/a.json')
  })

  it('yields undefined for --config/-c without a value — the caller decides how to fail', () => {
    expect(parseConfigArg(['--config'])).toBeUndefined()
    expect(parseConfigArg(['-c'])).toBeUndefined()
  })
})
