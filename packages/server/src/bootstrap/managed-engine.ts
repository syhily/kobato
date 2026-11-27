import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import {
  deleteDevHostValue,
  onDevHostDispose,
  readDevHostValue,
  writeDevHostValue,
} from '@kobato/server/infra/dev-host-state'
import { registerShutdownHook, unregisterShutdownHook } from '@kobato/server/infra/lifecycle'

export interface EngineAdapter<THandle> {
  open(): THandle | Promise<THandle>
  close(handle: THandle): void | Promise<void>
}

export class ManagedEngine<THandle> {
  private current: THandle | null = null

  private readonly closeHook = async (): Promise<void> => {
    await this.closeForSwap()
  }

  constructor(
    private readonly adapter: EngineAdapter<THandle>,
    private readonly key: string,
  ) {
    registerShutdownHook(this.closeHook, 0)
    onDevHostDispose(`bootstrap/managed-engine:${this.key}`, () => {
      unregisterShutdownHook(this.closeHook)
    })
  }

  private devHostHandle(): THandle | undefined {
    const cached = readDevHostValue(this.key)
    return cached !== null && typeof cached === 'object' ? unsafeCast<THandle>(cached) : undefined
  }

  async init(): Promise<THandle> {
    if (this.current !== null) {
      return this.current
    }
    const handle = this.devHostHandle() ?? (await this.adapter.open())
    this.current = handle
    writeDevHostValue(this.key, handle)
    return handle
  }

  peek(): THandle | null {
    return this.current
  }

  adopt(handle: THandle): void {
    this.current = handle
  }

  reset(): void {
    this.current = null
  }

  get(): THandle {
    if (this.current === null) {
      throw new Error('Engine not initialized')
    }
    return this.current
  }

  async closeForSwap(): Promise<void> {
    if (this.current === null) {
      return
    }
    const handle = this.current
    this.current = null
    deleteDevHostValue(this.key)
    await this.adapter.close(handle)
  }
}
