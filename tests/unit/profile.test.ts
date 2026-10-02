import { File as NodeFile } from 'node:buffer'
import type { User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ownedAvatarPath, saveAvatar, saveNickname } from '../../src/lib/profile'
import type { Profile } from '../../src/lib/profile'
import { user } from '../fixtures'

const sdk = vi.hoisted(() => ({
  getUser: vi.fn(), updateUser: vi.fn(), upload: vi.fn(), remove: vi.fn(),
  getPublicUrl: vi.fn(), from: vi.fn(), storageFrom: vi.fn(),
  select: vi.fn(), eq: vi.fn(), single: vi.fn(),
}))
vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getUser: sdk.getUser, updateUser: sdk.updateUser },
    from: sdk.from,
    storage: { from: sdk.storageFrom },
  }),
}))

const origin = 'https://project.supabase.co/storage/v1/object/public/avatars/'
const newPath = `${user.id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`
const newUrl = origin + newPath
const oldPath = `${user.id}/old.png`
const oldUrl = origin + oldPath
const otherUrl = origin + `${user.id}/other-tab.png`
let account: User
let projection: Profile

function commit(data: Record<string, unknown>) {
  account = { ...account, user_metadata: { ...account.user_metadata, ...data } }
  const metadata = account.user_metadata
  projection = {
    ...projection,
    display_name: metadata.display_name || metadata.name || metadata.full_name || '',
    avatar_url: metadata.avatar_url?.trim() || metadata.picture?.trim() || null,
  }
}
function png() {
  // Node's File supplies the real Blob.arrayBuffer API missing from jsdom's File.
  return new NodeFile([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], 'avatar.png', { type: 'image/png' }) as unknown as File
}
const responseFailure = { status: 503, message: 'upstream response lost' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  account = { ...user, user_metadata: { ...user.user_metadata, avatar_url: oldUrl, picture: oldUrl } }
  projection = { id: user.id, display_name: '水友', avatar_url: oldUrl, updated_at: '2026-10-02T00:00:00Z' }
  sdk.getUser.mockImplementation(async () => ({ data: { user: account }, error: null }))
  sdk.updateUser.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    commit(data)
    return { data: { user: account }, error: null }
  })
  sdk.single.mockImplementation(async () => ({ data: { ...projection }, error: null }))
  sdk.eq.mockReturnValue({ single: sdk.single })
  sdk.select.mockReturnValue({ eq: sdk.eq })
  sdk.from.mockReturnValue({ select: sdk.select })
  sdk.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: origin + path } }))
  sdk.upload.mockResolvedValue({ data: { path: newPath }, error: null })
  sdk.remove.mockResolvedValue({ data: [{ name: newPath }], error: null })
  sdk.storageFrom.mockReturnValue({ upload: sdk.upload, remove: sdk.remove, getPublicUrl: sdk.getPublicUrl })
})

describe('头像写入与失败补偿', () => {
  it('成功同步新头像后才清理原有本人头像', async () => {
    const result = await saveAvatar(user.id, png())
    expect(result.profile.avatar_url).toBe(newUrl)
    expect(result.cleanupPending).toBe(false)
    expect(sdk.remove).toHaveBeenCalledExactlyOnceWith([oldPath])
    expect(sdk.single.mock.invocationCallOrder[0]).toBeLessThan(sdk.remove.mock.invocationCallOrder[0])
  })

  it('Auth 响应丢失但服务端已提交时，恢复旧资料并确认后才清理新图片', async () => {
    sdk.updateUser.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
      commit(data)
      throw new TypeError('Failed to fetch')
    })
    await expect(saveAvatar(user.id, png())).rejects.toThrow('Failed to fetch')
    expect(sdk.updateUser).toHaveBeenCalledTimes(2)
    expect(sdk.updateUser).toHaveBeenLastCalledWith({ data: { avatar_url: oldUrl, picture: oldUrl } })
    expect(account.user_metadata.avatar_url).toBe(oldUrl)
    expect(projection.avatar_url).toBe(oldUrl)
    expect(sdk.remove).toHaveBeenCalledExactlyOnceWith([newPath])
    expect(sdk.getUser.mock.invocationCallOrder.at(-1)).toBeLessThan(sdk.remove.mock.invocationCallOrder[0])
  })

  it.each([responseFailure, { status: 408, message: 'timeout' }])('结果不明且暂时读到旧 metadata 时仍保留新文件：$status', async failure => {
    sdk.updateUser.mockResolvedValueOnce({ data: { user: null }, error: failure })
    await expect(saveAvatar(user.id, png())).rejects.toThrow('已保留图片')
    expect(sdk.updateUser).toHaveBeenCalledTimes(1)
    expect(sdk.remove).not.toHaveBeenCalled()
  })

  it('无法读取服务端确认结果时不删除可能仍在使用的图片', async () => {
    sdk.updateUser.mockResolvedValueOnce({ data: { user: null }, error: responseFailure })
    sdk.getUser.mockResolvedValueOnce({ data: { user: account }, error: null })
      .mockResolvedValueOnce({ data: { user: account }, error: null })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(saveAvatar(user.id, png())).rejects.toThrow('已保留图片')
    expect(sdk.remove).not.toHaveBeenCalled()
  })

  it('已观察提交但恢复旧 metadata 失败时保留新文件', async () => {
    sdk.updateUser.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
      commit(data)
      return { data: { user: null }, error: responseFailure }
    }).mockResolvedValueOnce({ data: { user: null }, error: responseFailure })
    await expect(saveAvatar(user.id, png())).rejects.toThrow('已保留图片')
    expect(account.user_metadata.avatar_url).toBe(newUrl)
    expect(sdk.remove).not.toHaveBeenCalled()
  })

  it('其他标签已完成另一头像更新时，不回滚覆盖该更新', async () => {
    sdk.updateUser.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
      commit(data)
      commit({ avatar_url: otherUrl, picture: otherUrl })
      return { data: { user: account }, error: null }
    })
    await expect(saveAvatar(user.id, png())).rejects.toThrow('资料同步尚未完成')
    expect(sdk.updateUser).toHaveBeenCalledTimes(1)
    expect(account.user_metadata.avatar_url).toBe(otherUrl)
    expect(sdk.remove).toHaveBeenCalledExactlyOnceWith([newPath])
  })

  it('明确 4xx 拒绝且 metadata/profile 均无新引用时可清理上传对象', async () => {
    const rejected = { status: 422, code: 'validation_failed' }
    sdk.updateUser.mockResolvedValueOnce({ data: { user: null }, error: rejected })
    await expect(saveAvatar(user.id, png())).rejects.toBe(rejected)
    expect(sdk.updateUser).toHaveBeenCalledTimes(1)
    expect(sdk.single).toHaveBeenCalledOnce()
    expect(sdk.remove).toHaveBeenCalledExactlyOnceWith([newPath])
  })

  it('资料读回失败不报告头像保存成功，确认恢复后才清理', async () => {
    const readError = new Error('profile read unavailable')
    sdk.single.mockRejectedValueOnce(readError)
    await expect(saveAvatar(user.id, png())).rejects.toBe(readError)
    expect(projection.avatar_url).toBe(oldUrl)
    expect(sdk.remove).toHaveBeenCalledExactlyOnceWith([newPath])
  })

  it('原头像只有 picture 别名时，失败补偿核对正确投影', async () => {
    account = { ...account, user_metadata: { ...account.user_metadata, avatar_url: null, picture: oldUrl } }
    const readError = new Error('profile read unavailable')
    sdk.single.mockRejectedValueOnce(readError)
    await expect(saveAvatar(user.id, png())).rejects.toBe(readError)
    expect(sdk.updateUser).toHaveBeenLastCalledWith({ data: { avatar_url: null, picture: oldUrl } })
    expect(sdk.remove).toHaveBeenCalledExactlyOnceWith([newPath])
  })

  it('换头像成功也不会删除他人目录中的旧头像', async () => {
    commit({ avatar_url: origin + 'someone-else/avatar.png', picture: origin + 'someone-else/avatar.png' })
    await expect(saveAvatar(user.id, png())).resolves.toMatchObject({ cleanupPending: false })
    expect(sdk.remove).not.toHaveBeenCalled()
  })
})

describe('资料来源与对象删除边界', () => {
  it('昵称触发器读回不一致时不能报告保存成功', async () => {
    sdk.single.mockResolvedValue({ data: { ...projection, display_name: '旧昵称' }, error: null })
    await expect(saveNickname(user.id, '新昵称')).rejects.toThrow('无法确认保存成功')
    expect(sdk.updateUser).toHaveBeenCalledExactlyOnceWith({ data: { display_name: '新昵称', name: '新昵称', full_name: '新昵称' } })
    expect(sdk.from).toHaveBeenCalledWith('profiles')
  })

  it('只接受本项目、本人目录的简单文件路径', () => {
    expect(ownedAvatarPath(user.id, oldUrl)).toBe(oldPath)
    for (const value of [
      'https://evil.example/storage/v1/object/public/avatars/' + oldPath,
      origin + 'someone-else/avatar.png',
      origin + user.id + '-suffix/avatar.png',
      origin + user.id + '/folder/avatar.png',
      origin + user.id + '/%2e%2e/other.png',
      origin + user.id + '/nested%2Favatar.png',
      oldUrl + '?download=true', oldUrl + '#fragment', 'javascript:alert(1)',
    ]) expect(ownedAvatarPath(user.id, value), value).toBeNull()
  })
})
