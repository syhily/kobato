import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

export type SeaApp = 'kobato' | 'sayaka'

export const SEA_APPS: readonly SeaApp[] = ['kobato', 'sayaka']

export const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')

export const OBSERVABILITY_SOURCE_ASSETS_DIR = 'packages/server/src/domains/observability/assets'
const KOBATO_APP_PACKAGE = 'apps/kobato/package.json'
const WORKSPACE_PACKAGE = '@kobato/web-admin'

export function observabilitySourceAssetsDir(): string {
  return resolve(repoRoot, OBSERVABILITY_SOURCE_ASSETS_DIR)
}

export function adminPackageDir(): string {
  const requireFromKobato = createRequire(resolve(repoRoot, KOBATO_APP_PACKAGE))
  return realpathSync(dirname(requireFromKobato.resolve(`${WORKSPACE_PACKAGE}/package.json`)))
}

export function adminClientBuildDir(): string {
  return resolve(adminPackageDir(), 'build', 'client')
}

export const SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

interface SeaAppShape {
  intermediatesDirName: string
  serverBundleFileName: string
}

const SEA_APP_SHAPES: Record<SeaApp, SeaAppShape> = {
  kobato: { intermediatesDirName: 'intermediates', serverBundleFileName: 'server.mjs' },
  sayaka: { intermediatesDirName: 'sayaka-intermediates', serverBundleFileName: 'sayaka-server.mjs' },
}

export function seaDistDir() {
  return resolve(repoRoot, 'dist-sea')
}

export function seaIntermediatesDir(app: SeaApp = 'kobato') {
  return resolve(seaDistDir(), SEA_APP_SHAPES[app].intermediatesDirName)
}

export function seaServerBundlePath(app: SeaApp = 'kobato') {
  return resolve(seaIntermediatesDir(app), SEA_APP_SHAPES[app].serverBundleFileName)
}

export function seaWorkerBundlePath() {
  return resolve(seaIntermediatesDir('kobato'), 'process-worker.mjs')
}

export function seaSmokeWorkerBundlePath() {
  return resolve(seaIntermediatesDir('kobato'), 'smoke-worker.mjs')
}

export function seaManifestPath(app: SeaApp = 'kobato') {
  return resolve(seaIntermediatesDir(app), 'manifest.json')
}

export function seaPackedAssetsDir(app: SeaApp = 'kobato') {
  return resolve(seaIntermediatesDir(app), 'packed')
}

export function seaStagedNativesDir() {
  return resolve(seaIntermediatesDir('kobato'), 'staged-natives')
}

export function seaConfigPath(app: SeaApp = 'kobato') {
  return resolve(seaIntermediatesDir(app), 'sea-config.json')
}

export function seaBinaryFileName(app: SeaApp = 'kobato') {
  return process.platform === 'win32' ? `${app}.exe` : app
}

export function seaBinaryPath(app: SeaApp = 'kobato') {
  return resolve(seaDistDir(), seaBinaryFileName(app))
}

export function seaBinarySha256Path(app: SeaApp = 'kobato') {
  return resolve(seaDistDir(), `${app}.sha256`)
}

export function sayakaBinarySiblingPath(kobatoBinaryPath: string): string {
  const sibling = kobatoBinaryPath.replace(/(^|[/\\])kobato(\.exe)?$/, `$1sayaka$2`)
  if (sibling === kobatoBinaryPath) {
    return resolve(seaDistDir(), seaBinaryFileName('sayaka'))
  }
  return sibling
}
