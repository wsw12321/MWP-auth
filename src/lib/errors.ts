import { isAuthSessionMissingError } from '@supabase/supabase-js'

const messages: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确，请重新输入。',
  email_not_confirmed: '请先验证邮箱，也可以重新发送验证邮件。',
  user_already_exists: '该邮箱已注册，请登录或找回密码。',
  email_exists: '该邮箱已被使用，请换一个邮箱。',
  signup_disabled: '暂时无法注册，请稍后再试。',
  weak_password: '密码强度不足，请使用更长的密码并组合字母、数字和符号。',
  same_password: '新密码不能与原密码相同。',
  over_email_send_rate_limit: '邮件发送过于频繁，请稍后再试。',
  over_request_rate_limit: '操作过于频繁，请稍后再试。',
  otp_expired: '验证链接或验证码无效或已过期，请重新获取。',
  reauthentication_needed: '为保护账号，请先获取并输入邮箱验证码，再保存密码。',
  reauthentication_not_valid: '验证码无效或已过期，请重新获取。',
  session_not_found: '登录状态已失效，请重新登录。',
  refresh_token_not_found: '登录状态已失效，请重新登录。',
  user_not_found: '账号不可用，请重新登录。',
}
export function errorMessage(error: unknown): string {
  if (isAuthSessionMissingError(error)) return '登录状态已失效，请重新登录。'
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    if (messages[code]) return messages[code]
  }
  if (error instanceof Error) {
    if (/fetch|network|Load failed/i.test(error.message)) return '网络连接失败，请检查网络后重试。'
    // Our own validation messages are safe to show. Avoid exposing raw backend details.
    if (/[\u4e00-\u9fff]/.test(error.message)) return error.message
  }
  return '操作未完成，请稍后重试。如持续出现，请联系站点管理员。'
}
