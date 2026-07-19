// SEA blob generation: write sea-config.json and run
// `node --experimental-sea-config` to produce the blob.

import { writeFile } from 'node:fs/promises'

import { run } from './exec.mjs'
import { seaBlobPath, seaConfigPath, seaMainBundlePath } from './paths.mjs'

/**
 * @param {Map<string, string>} assets asset key -> absolute file path
 *   (sorted — see assets.mjs). The config records absolute source paths;
 *   only the keys end up in the blob.
 */
export async function writeSeaConfig(assets) {
  const config = {
    main: seaMainBundlePath(),
    output: seaBlobPath(),
    assets: Object.fromEntries(assets),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
  }
  await writeFile(seaConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}

export async function runBlobStep(assets) {
  await writeSeaConfig(assets)
  run(process.execPath, ['--experimental-sea-config', seaConfigPath()])
}
