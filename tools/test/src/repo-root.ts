import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT: string = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
