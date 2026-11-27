import { isRecord } from '@kobato/base/utils/type-guards'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { registerShutdownHook } from '@kobato/server/infra/lifecycle'

export interface EngineAdapter<THandle> {
  open(): THandle | Promise<THandle>
  close(handle: THandle): void | Promise<void>
}

export class ManagedEngine<THandle> {
  private current: THandle | null = null

  constructor(
    private readonly adapter: EngineAdapter<THandle>,
    private readonly hmrKey: string,
  ) {
    registerShutdownHook(async () => {
      await this.closeForSwap()
    }, 0)
  }

  private hmrHandle(): THandle | undefined {
    const data: unknown = import.meta.hot?.data
    if (!isRecord(data)) {
      return undefined
    }
    const cached = data[this.hmrKey]
    return cached !== null && typeof cached === 'object' ? unsafeCast<THandle>(cached) : undefined
  }

  async init(): Promise<THandle> {
    if (this.current !== null) {
      return this.current
    }
    const handle = this.hmrHandle() ?? (await this.adapter.open())
    this.current = handle
    const hot = import.meta.hot
    if (hot && isRecord(hot.data)) {
      hot.data[this.hmrKey] = handle
    }
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
    const hot = import.meta.hot
    if (hot && isRecord(hot.data)) {
      delete hot.data[this.hmrKey]
    }
    await this.adapter.close(handle)
  }
}
