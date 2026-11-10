import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Object-URL preview leases are owned by the preview lease module:
 * `src/inkling/utils/preview-lease.ts` is the one file that creates and
 * releases them. Card and plugin sources must not call
 * URL.createObjectURL / URL.revokeObjectURL directly. The allowlists below are
 * the complete intentional exceptions and may only shrink.
 */

const SCANNED_DIRS = [join('src', 'inkling', 'nodes'), join('src', 'inkling', 'plugins')]
const OBJECT_URL_CALL = /URL\.(?:createObjectURL|revokeObjectURL)\(/g

// No exceptions: every card/plugin preview flows through the seam.
const ALLOWED_DIRECT_CALLERS: string[] = []

// The sanctioned object-URL caller across all of src: the lease owner.
const ALLOWED_OBJECT_URL_FILES = ['src/inkling/utils/preview-lease.ts']

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
}

/** True when a source file calls URL.createObjectURL / URL.revokeObjectURL. */
function callsObjectUrl(file: string): boolean {
  return readFileSync(file, 'utf8').match(OBJECT_URL_CALL) !== null
}

describe('upload preview import guard', () => {
  it('no card or plugin source calls URL.createObjectURL / URL.revokeObjectURL directly', () => {
    const offenders: string[] = []

    for (const dir of SCANNED_DIRS) {
      for (const name of listSourceFiles(dir)) {
        if (callsObjectUrl(join(dir, name))) {
          offenders.push(`${dir}/${name.split(sep).join('/')}`)
        }
      }
    }

    expect(offenders.sort()).toEqual(ALLOWED_DIRECT_CALLERS)
  })

  it('the lease owner is the only object-URL caller', () => {
    const callers = listSourceFiles(join('src', 'inkling'))
      .map((name) => `src/inkling/${name.split(sep).join('/')}`)
      .filter(callsObjectUrl)
      .sort()

    expect(callers).toEqual(ALLOWED_OBJECT_URL_FILES)
  })
})
