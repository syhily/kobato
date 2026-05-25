import { TZDate } from '@date-fns/tz'
import { getYear } from 'date-fns'

import { Body, Container, Html, Img, Link, Section, Text } from '@/server/infra/email/render'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  receiver: string
  preview?: string
  children: React.ReactNode
}

export function EmailLayout({ receiver, children }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  // Render the year in the site's configured timezone — important
  // around midnight for sites whose timezone differs from the SSR
  // host. `TZDate` from `@date-fns/tz` re-interprets the supplied
  // instant against the IANA zone, so `getYear` reads the wall-clock
  // year that user would see in their inbox.
  const year = getYear(new TZDate(Date.now(), siteIdentity.timeZone))
  return (
    <Html lang="en">
      <Body style={body}>
        <Container style={container}>
          <Section style={{ padding: 0 }}>
            <div style={hero}>
              <Img
                src="https://example.com/images/blog-poster-dark.png"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                alt={siteIdentity.title}
              />
            </div>
          </Section>
          <Section style={{ textAlign: 'center', padding: '10px 0' }}>
            <span style={receiverPill}>亲爱的 {receiver} 同学</span>
          </Section>
          <Section style={{ padding: 20 }}>
            <div style={contentBox}>{children}</div>
          </Section>
          <Section style={{ textAlign: 'center', padding: 20 }}>
            <Link href={siteIdentity.website} target="_blank" rel="noreferrer" style={ctaButton}>
              访问博客
            </Link>
          </Section>
          <Section style={{ textAlign: 'center', padding: 20 }}>
            <Text style={footer}>
              本邮件为系统自动发出，无法回复。
              <br />© {year}{' '}
              <Link href={siteIdentity.website} style={footerLink} target="_blank" rel="noreferrer">
                {siteIdentity.title}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const body: React.CSSProperties = {
  margin: 0,
  padding: '20px 0',
  fontFamily: 'Arial, sans-serif',
  backgroundColor: '#f5f5f5',
}

const container: React.CSSProperties = {
  width: 500,
  backgroundColor: '#ffffff',
  border: '1px solid #283149',
  boxShadow: '0 0 20px #cccccc',
  borderRadius: 5,
  margin: '0 auto',
}

const hero: React.CSSProperties = {
  width: '100%',
  height: 200,
  borderRadius: '5px 5px 0 0',
  backgroundColor: '#283148',
  overflow: 'hidden',
  position: 'relative',
}

const receiverPill: React.CSSProperties = {
  display: 'inline-block',
  padding: '7px 20px',
  background: '#008c95',
  color: '#ffffff',
  textAlign: 'center',
  boxShadow: '3px 3px 5px rgba(0,0,0,0.3)',
  borderRadius: 3,
}

const contentBox: React.CSSProperties = {
  padding: '10px 15px',
  background: '#f5f5f5',
  borderRadius: 3,
}

const ctaButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  background: '#008c95',
  color: '#ffffff',
  textDecoration: 'none',
  borderRadius: 3,
  boxShadow: '3px 3px 5px rgba(0,0,0,0.3)',
}

const footer: React.CSSProperties = {
  fontSize: 12,
  color: '#666666',
  margin: 0,
}

const footerLink: React.CSSProperties = {
  color: '#666666',
  textDecoration: 'none',
}
