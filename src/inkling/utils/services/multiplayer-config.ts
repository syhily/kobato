// Multiplayer configuration — the yjs-free half of the collaboration seam
// (plan C5). `InklingComposerBase` validates the props synchronously at the
// composer boundary from this module, so the yjs/y-websocket graph in
// `./collaboration` can load lazily (dynamic import inside an effect) without
// delaying the config error hosts rely on.
export function requireMultiplayerConfig(multiplayerEndpoint?: string, multiplayerDocId?: string) {
  if (!multiplayerEndpoint || !multiplayerDocId) {
    throw new Error('<InklingComposer> enableMultiplayer requires both multiplayerEndpoint and multiplayerDocId')
  }
  return { multiplayerEndpoint, multiplayerDocId }
}
