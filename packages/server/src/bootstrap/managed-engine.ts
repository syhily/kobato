import { registerShutdownHook } from '@kobato/server/infra/lifecycle'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

/**
 * The holder mechanics every engine lifecycle needs, written once: a
 * module-scope `current`, HMR-safe reuse across dev re-evaluations
 * (React Router re-evaluates the server graph on every cycle — the
 * handle survives via `import.meta.hot.data` instead of leaking
 * connections), an idempotent close, and the priority-0 shutdown hook
 * (batchers flush at priority 100, so engines close after). The
 * engine-specific parts — open, close, and everything the composition
 * root wires on top — stay in the per-engine lifecycle modules behind
 * the adapter. Two adapters exist (content SQLite, analytics DuckDB),
 * which is what justifies the seam.
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

  /** Initialize (or reuse) the handle: HMR cache → open → cache. */
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

  /**
   * Test seam: place an externally-created handle inside the engine
   * (a real temp-file database owned by the test) without open() or
   * any scheduling side effects. Pair with {@link reset} between
   * cases — adoption persists as module state otherwise.
   */
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

  /** Close and forget — the restore swap and the shutdown hook share
   *  this; the HMR cache is cleared so a dev re-evaluation never
   *  resurrects a closed handle. */
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
