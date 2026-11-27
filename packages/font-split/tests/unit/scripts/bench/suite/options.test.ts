import { parseOptions, UsageError } from '@kobato/font-split/scripts/bench/suite/options'
import { repoRoot } from '@kobato/font-split/scripts/bench/suite/paths'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('font-split benchmark options', () => {
  it('defaults to the production fonts, the repository data directory and 8 threads', () => {
    const options = parseOptions([])
    expect(options.dataDir).toBe(resolve(repoRoot, 'data'))
    expect(options.workDir).toBe(resolve(repoRoot, 'packages/font-split/target/bench'))
    expect(options.fonts.map((font) => font.file)).toEqual(['calendar.ttf', 'og.ttf'])
    expect(options.threads).toBe(8)
    expect(options.skip).toEqual([])
    expect(options.quick).toBe(false)
    expect(options.reportOnly).toBe(false)
    expect(options.deployedPackage).toBeNull()
  })

  it('reads the flags in any order', () => {
    const options = parseOptions([
      '--quick',
      '--skip',
      'loading-time,slicing-time',
      '--threads',
      '4',
      '--data-dir',
      '/tmp/data',
      '--deployed-package',
      '/tmp/deployed',
      '--font',
      'Big Font=/fonts/big.ttf',
      '--report-only',
    ])
    expect(options.quick).toBe(true)
    expect(options.reportOnly).toBe(true)
    expect(options.skip).toEqual(['loading-time', 'slicing-time'])
    expect(options.threads).toBe(4)
    expect(options.dataDir).toBe('/tmp/data')
    expect(options.deployedPackage).toBe('/tmp/deployed')
    expect(options.fonts).toEqual([{ key: 'big-font', label: 'Big Font', file: '/fonts/big.ttf' }])
  })

  it('passes over the -- that pnpm forwards after the script name', () => {
    expect(parseOptions(['--', '--quick', '--skip', 'shaping'])).toStrictEqual(
      parseOptions(['--quick', '--skip', 'shaping']),
    )
  })

  it('rejects malformed usage with the usage text', () => {
    const usage = (argv: string[]): string => {
      try {
        parseOptions(argv)
      } catch (error) {
        expect(error).toBeInstanceOf(UsageError)
        return (error as UsageError).message
      }
      throw new Error('expected a usage error')
    }
    expect(usage(['--skip', 'nope'])).toMatch(/unknown stage nope/)
    expect(usage(['--threads', '0'])).toMatch(/positive integer/)
    expect(usage(['--threads', 'x'])).toMatch(/positive integer/)
    expect(usage(['--data-dir'])).toMatch(/--data-dir needs a value/)
    expect(usage(['--font', '/fonts/a.ttf'])).toMatch(/<label>=<path>/)
    expect(usage(['--wat'])).toMatch(/unknown argument --wat/)
    expect(parseOptions([]).fonts).toHaveLength(2)
  })
})
