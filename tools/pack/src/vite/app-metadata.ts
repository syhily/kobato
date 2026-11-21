import { repoRoot } from '@kobato/pack/sea/paths'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const appPackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

export type AppPackage = z.infer<typeof appPackageSchema>

export function readAppPackage(): AppPackage {
  const raw = readFileSync(resolve(repoRoot, 'apps/kobato/package.json'), 'utf-8')
  return appPackageSchema.parse(JSON.parse(raw))
}

export function appDefines(pkg: AppPackage): Record<string, string> {
  return {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  }
}

export function seaAppDefines(pkg: AppPackage): Record<string, string> {
  return {
    __SEA_APP_VERSION__: JSON.stringify(pkg.version),
    ...appDefines(pkg),
  }
}
