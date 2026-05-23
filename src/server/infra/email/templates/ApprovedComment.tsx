import { Link, Text } from '@/server/infra/email/render'
import { SafeEmailHtml } from '@/server/infra/email/safe-html'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { requireBlogSettingsSection } from '@/shared/config/blog'

interface Props {
  receiver: string
  postTitle: string
  postLink: string
  commentContent: string
  commentLink: string
}

export function ApprovedComment({ receiver, postTitle, postLink, commentContent, commentLink }: Props) {
  // Anonymous commenters can claim their account by self-requesting a
  // reset on the public lostpassword page. Building the link off
  // `siteIdentity.website` keeps the origin in sync with whatever the
  // operator configured in `/admin/settings/general`.
  const resetPasswordLink = `${requireBlogSettingsSection('siteIdentity').website}/admin/signin?action=lostpassword`
  return (
    <EmailLayout receiver={receiver}>
      <Text style={paragraph}>
        您在《
        <Link href={postLink} style={inlineLink}>
          {postTitle}
        </Link>
        》中的留言，已经通过审核
      </Text>
      <div style={quoteBox}>
        <SafeEmailHtml html={commentContent} style={quoteText} />
      </div>
      <Text style={paragraph}>您可以打开下方链接查看留言：</Text>
      <Link href={commentLink} target="_blank" rel="noreferrer" style={primaryLink}>
        {commentLink}
      </Link>
      <Text style={paragraph}>想要查看与管理你的所有历史评论？通过此链接重置密码登录即可：</Text>
      <Link href={resetPasswordLink} target="_blank" rel="noreferrer" style={primaryLink}>
        {resetPasswordLink}
      </Link>
    </EmailLayout>
  )
}

export default ApprovedComment

const paragraph: React.CSSProperties = {
  fontSize: 14,
  color: '#333333',
  lineHeight: 1.5,
  margin: '0 0 15px',
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
