// SEA config generation: write sea-config.json for `node --build-sea`.
// `output` is the FINAL executable path; `mainFormat: "module"` means no
// CJS prelude — runtime bootstrap order lives in the entry's import order.

import { writeFile } from 'node:fs/promises'

import { seaConfigPath, seaServerBundlePath } from './paths.ts'

/**
 * @param assets asset key -> absolute file path (sorted — see assets.ts).
 *   The config records absolute source paths; only the keys end up in the blob.
 */
export async function writeSeaConfig(assets: Map<string, string>, output: string) {
  const config = {
    main: seaServerBundlePath(),
    mainFormat: 'module',
    output,
    assets: Object.fromEntries(assets),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
  }
  await writeFile(seaConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}
