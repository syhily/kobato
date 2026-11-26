import { type SeaApp, seaConfigPath, seaServerBundlePath } from '@kobato/pack/sea/paths'
import { writeFile } from 'node:fs/promises'

export async function writeSeaConfig(app: SeaApp, assets: Map<string, string>, output: string) {
  const config = {
    main: seaServerBundlePath(app),
    mainFormat: 'module',
    output,
    assets: Object.fromEntries(assets),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    useVfs: true,
  }
  await writeFile(seaConfigPath(app), `${JSON.stringify(config, null, 2)}\n`)
}
