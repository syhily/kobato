import { seaConfigPath, seaServerBundlePath } from '@kobato/pack/sea/paths.ts'
import { writeFile } from 'node:fs/promises'

export async function writeSeaConfig(assets: Map<string, string>, output: string) {
  const config = {
    main: seaServerBundlePath(),
    mainFormat: 'module',
    output,
    assets: Object.fromEntries(assets),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    useVfs: true,
  }
  await writeFile(seaConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}
