// Fresh-checkout fallback for the side-effect import of build/server/index.js
// (no build/ output during CI typecheck); the built file wins when present.
declare module '*/build/server/index.js'
