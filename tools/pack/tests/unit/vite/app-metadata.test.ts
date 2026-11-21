import { appDefines, readAppPackage, seaAppDefines } from '@kobato/pack/vite/app-metadata'
import { describe, expect, it } from 'vitest'

describe('readAppPackage', () => {
  it('reads the deployable app manifest from the workspace', () => {
    const pkg = readAppPackage()
    expect(pkg.name).toBe('kobato')
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('appDefines', () => {
  it('produces the six __APP_*__ globals as JSON literals', () => {
    const pkg = readAppPackage()
    expect(appDefines(pkg)).toEqual({
      __APP_NAME__: JSON.stringify(pkg.name),
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_DESCRIPTION__: JSON.stringify(pkg.description),
      __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
      __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
      __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
    })
  })
})

describe('seaAppDefines', () => {
  it('adds __SEA_APP_VERSION__ on top of the app globals', () => {
    const pkg = readAppPackage()
    const defines = seaAppDefines(pkg)
    expect(defines.__SEA_APP_VERSION__).toBe(JSON.stringify(pkg.version))
    expect(Object.keys(defines)).toHaveLength(7)
  })
})
