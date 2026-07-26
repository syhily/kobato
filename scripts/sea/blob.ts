// SEA config generation: write sea-config.json for the two injector
// paths. The same JSON shape feeds both — for `--experimental-sea-config`
// (the postject path) `output` is the BLOB path; for `--build-sea`
// `output` is the FINAL executable path (see scripts/sea/inject.ts).
//
// `main` is the single-file ESM server bundle and `mainFormat` is
// `module`: the injected entry is `server.mjs` itself, so there is no
// CJS prelude and no bundle materialization at runtime (the bootstrap
// ordering lives in the entry's import order — see
// `scripts/sea/server-entry.ts`).

import { writeFile } from 'node:fs/promises'

import { run } from './exec.ts'
import { seaBlobPath, seaConfigPath, seaServerBundlePath } from './paths.ts'

/**
 * @param assets asset key -> absolute file path
 *   (sorted — see assets.ts). The config records absolute source paths;
 *   only the keys end up in the blob.
 * @param output blob path (--experimental-sea-config) or final binary
 *   path (--build-sea), depending on the caller's injector.
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

/**
 * The postject path's blob generation (`node --experimental-sea-config`).
 * `--build-sea` builds its blob internally and never calls this.
 */
export async function runBlobStep(assets: Map<string, string>) {
  await writeSeaConfig(assets, seaBlobPath())
  run(process.execPath, ['--experimental-sea-config', seaConfigPath()])
}
