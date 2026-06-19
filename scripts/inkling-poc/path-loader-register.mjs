import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./scripts/inkling-poc/path-loader.mjs'))
