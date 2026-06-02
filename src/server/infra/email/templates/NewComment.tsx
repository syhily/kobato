import { Link, Text } from '@/server/infra/email/render'
import { RawEmailHtml } from '@/server/infra/email/safe-html'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  postTitle: string
  postLink: string
  commentNeedApproval: boolean
  commentContent: string
  commentLink: string
}

export function NewComment({ postTitle, postLink, commentNeedApproval, commentContent, commentLink }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return (
    <EmailLayout receiver={siteIdentity.author.name}>
      <Text style={paragraph}>您的网站《{siteIdentity.title}》有了新留言</Text>
      <Text style={paragraph}>
        留言文章：
        <Link href={postLink} style={inlineLink}>
          {postTitle}
        </Link>
      </Text>
      <div style={quoteBox}>
        <RawEmailHtml html={commentContent} style={quoteText} />
      </div>
      <Text style={paragraph}>{commentNeedApproval ? '该留言需要审核，' : ''}您可以打开下方链接查看留言：</Text>
      <Link href={commentLink} target="_blank" rel="noreferrer" style={primaryLink}>
        {commentLink}
      </Link>
    </EmailLayout>
  )
}

export default NewComment

const paragraph: React.CSSProperties = {
  fontSize: 14,
  color: '#333333',
  lineHeight: 1.5,
  margin: '0 0 10px',
}

const inlineLink: React.CSSProperties = {
  color: '#666666',
  textDecoration: 'none',
}

const primaryLink: React.CSSProperties = {
  fontSize: 14,
  color: '#008c95',
  textDecoration: 'none',
}

const quoteBox: React.CSSProperties = {
  background: 'rgba(141,141,141,0.05)',
  borderRadius: 8,
  padding: '10px 15px',
  marginBottom: 15,
}

const quoteText: React.CSSProperties = {
  fontSize: 14,
  color: '#333333',
  lineHeight: 1.7,
}
