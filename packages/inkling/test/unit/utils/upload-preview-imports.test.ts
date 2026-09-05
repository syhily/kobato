import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * Plan 045 import guard: object-URL preview leases are owned by the preview
 * lease module — src/utils/preview-lease.ts is the one file that creates and
 * releases them. Card and plugin sources must not call URL.createObjectURL /
 * URL.revokeObjectURL directly — and since round 3 (C6/C7) neither does
 * extractVideoMetadata, which leases its URL from the seam. The allowlists
 * below are the complete intentional exceptions and may only shrink: delete
 * an entry when a file stops touching object URLs.
 */

const SCANNED_DIRS = [join('src', 'nodes'), join('src', 'plugins')]
const OBJECT_URL_CALL = /URL\.(?:createObjectURL|revokeObjectURL)\(/g

// No exceptions: every card/plugin preview flows through the seam.
const ALLOWED_DIRECT_CALLERS: string[] = []

// The sanctioned object-URL caller across all of src: the lease owner.
const ALLOWED_OBJECT_URL_FILES = ['src/utils/preview-lease.ts']

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
    const callers = listSourceFiles('src')
      .map((name) => `src/${name.split(sep).join('/')}`)
      .filter(callsObjectUrl)
      .sort()

    expect(callers).toEqual(ALLOWED_OBJECT_URL_FILES)
  })
})
