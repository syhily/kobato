import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const IGNORE_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.react-router'])

export interface WorkspacePackage {
  name: string
  dir: string
}

function collectPackages(root: string, dir: string, out: WorkspacePackage[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectPackages(root, full, out)
    } else if (entry.name === 'package.json') {
      const manifest = JSON.parse(readFileSync(full, 'utf8')) as { name: string }
      const dir = relative(root, full).slice(0, -'/package.json'.length).split(sep).join('/')
      out.push({ name: manifest.name, dir })
    }
  }
}

export const REPO_PACKAGES: readonly WorkspacePackage[] = ['apps', 'packages', 'shared', 'tools']
  .flatMap((root) => {
    const packages: WorkspacePackage[] = []
    collectPackages(process.cwd(), join(process.cwd(), root), packages)
    return packages
  })
  .sort((a, b) => a.dir.localeCompare(b.dir))
