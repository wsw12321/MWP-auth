import { describe, expect, it } from 'vitest'
import { applicationUrl } from '../../src/lib/sites'

describe('已授权应用的登录入口', () => {
  it('已接入的 Codex 客户端从网关发起登录，不使用授权返回的任意网站地址', () => {
    expect(applicationUrl({ id: '3e9c79d8-3c51-4fee-a986-7a2d5fed62dc', uri: 'https://other.example' }))
      .toBe('https://codex.water555.com/?login=water5')
  })

  it('其他应用可访问合法的 HTTPS 网站地址', () => {
    expect(applicationUrl({ id: 'other', uri: 'https://client.example/start' })).toBe('https://client.example/start')
  })

  it.each([undefined, '', 'javascript:alert(1)', 'data:text/html,hello', 'http://client.example', '//client.example', 'https://user:password@client.example', 'invalid'])('不将不安全的客户端 URI %s 渲染为链接', uri => {
    expect(applicationUrl({ id: 'other', uri })).toBeNull()
  })
})
