import { AuthSessionMissingError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { errorMessage } from '../../src/lib/errors'
import { sessionExpired } from '../../src/lib/oauth'

describe('SDK会话失效异常兼容', () => {
  it('AuthSessionMissingError没有code且status为400时仍提示重新登录', () => {
    // Supabase converts a server session_not_found response into this exception.
    const error = new AuthSessionMissingError()
    expect(error.code).toBeUndefined()
    expect(error.status).toBe(400)
    expect(errorMessage(error)).toContain('登录状态已失效')
    expect(sessionExpired(error)).toBe(true)
  })
})
