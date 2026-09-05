import { isTestEnv } from '#/utils/isTestEnv'

export interface TenorConfig {
  googleApiKey: string
}

export interface KlipyConfig {
  apiKey: string
}

export const tenorConfig: TenorConfig | null = isTestEnv ? { googleApiKey: 'xxx' } : getTenorConfig()

// In tests the GIF provider defaults to Tenor; the ?gifProvider=klipy query
// param opts a specific test into the Klipy path.
export const klipyConfig: KlipyConfig | null = isTestEnv ? getTestKlipyConfig() : getKlipyConfig()

function getTenorConfig(): TenorConfig | null {
  let config: TenorConfig | null = null

  if (import.meta.env.VITE_TENOR_API_KEY) {
    config = {
      googleApiKey: import.meta.env.VITE_TENOR_API_KEY,
    }
  }

  return config
}

function getKlipyConfig(): KlipyConfig | null {
  let config: KlipyConfig | null = null

  if (import.meta.env.VITE_KLIPY_API_KEY) {
    config = {
      apiKey: import.meta.env.VITE_KLIPY_API_KEY,
    }
  }

  return config
}

function getTestKlipyConfig(): KlipyConfig | null {
  const provider = new URLSearchParams(window.location.search).get('gifProvider')
  return provider === 'klipy' ? { apiKey: 'xxx' } : null
}
