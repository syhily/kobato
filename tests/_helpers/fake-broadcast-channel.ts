// BroadcastChannel is only available in DOM contexts; stub it for the
// test environment. Instances on the same name receive each other's
// messages synchronously, which lets tests fan out cross-tab events
// without timers.
export class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  name: string
  onmessage: ((ev: MessageEvent) => void) | null = null
  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }
  addEventListener(_type: string, cb: (ev: MessageEvent) => void) {
    this.onmessage = cb
  }
  removeEventListener() {
    this.onmessage = null
  }
  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.instances) {
      if (peer !== this && peer.name === this.name && peer.onmessage) {
        peer.onmessage(new MessageEvent('message', { data }))
      }
    }
  }
  close() {
    this.onmessage = null
  }
}
