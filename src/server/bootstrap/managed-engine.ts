import { registerShutdownHook } from '@/server/infra/lifecycle'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Shared holder mechanics for the engine lifecycles: module-scope handle,
 * HMR-safe reuse, idempotent close, priority-0 shutdown hook (batchers
 * flush at 100). Per-engine logic lives behind the adapter.
 */
export interface EngineAdapter<THandle> {
  /** Open a fresh handle (skipped when the HMR cache has one). */
  open(): THandle | Promise<THandle>
  /** Engine close — must be idempotent on the handle itself. */
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

  /** The handle, or null while closed (between the restore swap and reopen). */
  peek(): THandle | null {
    return this.current
  }

  /** Test seam: adopt an externally-created handle without open()/scheduling. Pair with {@link reset} between cases. */
  adopt(handle: THandle): void {
    this.current = handle
  }

  /** Test seam: forget the current handle without closing it. */
  reset(): void {
    this.current = null
  }

  /** The handle, throwing while closed. */
  get(): THandle {
    if (this.current === null) {
      throw new Error('Engine not initialized')
    }
    return this.current
  }

  /** Close and forget — also clears the HMR cache slot. */
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
