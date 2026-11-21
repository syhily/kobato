// Zod 4.5 auto-compilation first, so even the config-graph schemas constructed
// by sea-cli/sea-bootstrap get compiled on first parse.
import 'zod/compile'
import '@kobato/server/infra/sea/sea-cli'
import '@kobato/server/infra/sea/sea-bootstrap'
import '../../../../apps/kobato/build/server/index.js'
