import { sitemapInputSchema, sitemapOutputSchema } from '@kobato/api/contracts/public/sitemap'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const sitemapContract = {
  xml: defineProcedure({ method: 'GET', path: '/sitemap/xml' }, { publicRead: true })
    .input(sitemapInputSchema)
    .output(sitemapOutputSchema),
}
