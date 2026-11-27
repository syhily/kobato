import type { Transferable } from 'node:worker_threads'

import { Worker } from 'node:worker_threads'

interface Waiter {
  resolve: (worker: Worker) => void
  reject: (error: Error) => void
}

export class WorkerPool<Message, Result> {
  private readonly workers: Worker[] = []
  private readonly idle: Worker[] = []
  private readonly waiters: Waiter[] = []
  private failure: Error | null = null

  constructor(url: URL, size: number) {
    for (let index = 0; index < size; index += 1) {
      const worker = new Worker(url)
      this.workers.push(worker)
      this.idle.push(worker)
    }
  }

  run(message: Message, transfer: readonly Transferable[]): Promise<Result> {
    return this.acquire().then(
      (worker) =>
        new Promise<Result>((resolve, reject) => {
          let settled = false
          const finish = (settle: () => void, failed: Error | null): void => {
            if (settled) {
              return
            }
            settled = true
            worker.off('message', onMessage)
            worker.off('error', onError)
            worker.off('exit', onExit)
            settle()
            if (failed === null) {
              this.idle.push(worker)
            } else {
              this.fail(failed)
            }
          }
          const onMessage = (result: Result): void => finish(() => resolve(result), null)
          const onError = (error: Error): void => finish(() => reject(error), error)
          const onExit = (code: number): void => {
            const error = new Error(`worker exited with code ${code}`)
            finish(() => reject(error), error)
          }
          worker.on('message', onMessage)
          worker.on('error', onError)
          worker.on('exit', onExit)
          worker.postMessage(message, transfer)
        }),
    )
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()))
  }

  private acquire(): Promise<Worker> {
    if (this.failure !== null) {
      return Promise.reject(this.failure)
    }
    const worker = this.idle.pop()
    if (worker !== undefined) {
      return Promise.resolve(worker)
    }
    return new Promise<Worker>((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  private fail(error: Error): void {
    this.failure ??= error
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(this.failure)
    }
  }
}
