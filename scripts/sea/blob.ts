// SEA config generation: write sea-config.json for `node --build-sea`.
// The config's `output` is the FINAL executable path — `--build-sea`
// regenerates the blob internally and patches the binary in one step
// (see scripts/sea/inject.ts).
//
// `main` is the single-file ESM server bundle and `mainFormat` is
// `module`: the injected entry is `server.mjs` itself, so there is no
// CJS prelude and no bundle materialization at runtime (the bootstrap
// ordering lives in the entry's import order — see
// `scripts/sea/server-entry.ts`).

import { writeFile } from 'node:fs/promises'

import { seaConfigPath, seaServerBundlePath } from './paths.ts'

/**
 * @param assets asset key -> absolute file path
 *   (sorted — see assets.ts). The config records absolute source paths;
 *   only the keys end up in the blob.
 * @param output the final executable path `--build-sea` writes.
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
