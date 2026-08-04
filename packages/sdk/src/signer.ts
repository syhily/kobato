import { createPrivateKey, sign } from 'node:crypto'

/**
 * EdDSA (Ed25519) JWT signer for the headless write chain.
 *
 * The frontend program holds the private key; core stores only the
 * matching public key (registered via `admin.apikey.register`). Tokens
 * carry `{ iss: key-id, scope, exp }` and must stay short-lived — core
 * enforces exp ≤ 5 min with ±60 s skew tolerance.
 *
 * Zero workspace dependencies: this module is the publish-friendly core
 * of the SDK (only `node:crypto` + the key material).
 */

export interface KeyAuthSigner {
  /** Sign a JWT for the given scopes. `exp` defaults to now + 5 min. */
  sign(input: { scope: string[]; exp?: number }): string
}

export function createKeyAuthSigner(privateKeyPem: string, keyId: string): KeyAuthSigner {
  const privateKey = createPrivateKey(privateKeyPem)
  const enc = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    sign: ({ scope, exp }) => {
      const now = Math.floor(Date.now() / 1000)
      const header = enc({ alg: 'EdDSA', typ: 'JWT' })
      const payload = enc({ iss: keyId, scope, exp: exp ?? now + 5 * 60 })
      const data = `${header}.${payload}`
      const signature = sign(null, Buffer.from(data, 'utf8'), privateKey)
      return `${data}.${signature.toString('base64url')}`
    },
  }
}
