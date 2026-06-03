import { Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'

interface Props {
  receiver: string
  otpCode: string
  expiresMinutes: number
}

export function SignInOtp({ receiver, otpCode, expiresMinutes }: Props) {
  return (
    <EmailLayout receiver={receiver}>
      <Text style={paragraph}>你正在尝试登录后台管理。</Text>
      <Text style={paragraph}>请输入以下验证码完成登录：</Text>
      <Text style={otpCodeStyle}>{otpCode}</Text>
      <Text style={hint}>验证码 {expiresMinutes} 分钟内有效，请勿将验证码告知他人。 如非本人操作，请忽略此邮件。</Text>
    </EmailLayout>
  )
}

export default SignInOtp

const paragraph: React.CSSProperties = {
  fontSize: 14,
  color: '#333333',
  lineHeight: 1.5,
  margin: '0 0 10px',
}

const otpCodeStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 'bold',
  color: '#008c95',
  letterSpacing: '4px',
  textAlign: 'center',
  margin: '20px 0',
  padding: '16px',
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
}

const hint: React.CSSProperties = {
  fontSize: 12,
  color: '#666666',
  lineHeight: 1.5,
  margin: '15px 0 0',
}
