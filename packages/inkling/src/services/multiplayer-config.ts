export function requireMultiplayerConfig(multiplayerEndpoint?: string, multiplayerDocId?: string) {
  if (!multiplayerEndpoint || !multiplayerDocId) {
    throw new Error('<InklingComposer> enableMultiplayer requires both multiplayerEndpoint and multiplayerDocId')
  }
  return { multiplayerEndpoint, multiplayerDocId }
}
