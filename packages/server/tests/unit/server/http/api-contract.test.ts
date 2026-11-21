import { apiContract } from '@kobato/api/contract'
import { apiRouter } from '@kobato/server/http/api-router'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

interface ProcedureDef {
  route: { method?: string; path?: string }
  inputSchema: unknown
  outputSchema: unknown
}

type Entry = [string, object]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function contractEntries(value: unknown, prefix = '', out: Entry[] = []): Entry[] {
  if (isContractProcedure(value)) {
    out.push([prefix, value as object])
    return out
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      contractEntries(child, prefix === '' ? key : `${prefix}.${key}`, out)
    }
  }
  return out
}

function implementedEntries(value: unknown, prefix = '', out: Entry[] = []): Entry[] {
  if (!isRecord(value)) {
    return out
  }
  if ('~orpc' in value && isRecord(value['~orpc']) && 'route' in value['~orpc']) {
    out.push([prefix, value])
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    implementedEntries(child, prefix === '' ? key : `${prefix}.${key}`, out)
  }
  return out
}

function def(procedure: object): ProcedureDef {
  return (procedure as { '~orpc': ProcedureDef })['~orpc']
}

describe('apiContract ⇄ apiRouter full parity', () => {
  const contracts = new Map(contractEntries(apiContract))
  const implemented = new Map(implementedEntries(apiRouter))

  it('implements exactly the same procedure keys across every domain', () => {
    expect(contracts.size).toBeGreaterThan(150)
    expect([...implemented.keys()].sort()).toEqual([...contracts.keys()].sort())
  })

  it.each([...contracts.entries()])('%s keeps route and schema identity', (key) => {
    const contract = contracts.get(key)!
    const procedure = implemented.get(key)!
    expect(def(procedure).route).toEqual(def(contract).route)
    expect(def(procedure).inputSchema).toBe(def(contract).inputSchema)
    expect(def(procedure).outputSchema).toBe(def(contract).outputSchema)
  })
})
