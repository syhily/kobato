import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/server/infra/db/schema/shared.ts',
    './src/server/infra/db/schema/metric.ts',
    './src/server/infra/db/schema/comment.ts',
    './src/server/infra/db/schema/user.ts',
    './src/server/infra/db/schema/friend.ts',
    './src/server/infra/db/schema/taxonomy.ts',
    './src/server/infra/db/schema/media.ts',
    './src/server/infra/db/schema/page.ts',
    './src/server/infra/db/schema/post.ts',
    './src/server/infra/db/schema/content.ts',
    './src/server/infra/db/schema/config.ts',
  ],
  out: './drizzle',
})
