import type { User } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

export type Profile = { id: string; display_name: string; avatar_url: string | null; updated_at: string }
const bucketName = 'avatars'
const maxAvatarBytes = 2 * 1024 * 1024

export async function requireCurrentUser(userId: string): Promise<User> {
  const { data, error } = await getSupabase().auth.getUser()
  if (error) throw error
  if (!data.user || data.user.id !== userId) throw new Error('登录账号已改变，请刷新页面后重试。')
  return data.user
}

export async function readProfile(userId: string): Promise<Profile> {
  const { data, error } = await getSupabase().from('profiles').select('id,display_name,avatar_url,updated_at').eq('id', userId).single()
  if (error) throw error
  if (!data || data.id !== userId) throw new Error('资料未能读取，请稍后重试或联系管理员。')
  return data as Profile
}

async function verifyProfile(userId: string, expected: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>): Promise<Profile> {
  const profile = await readProfile(userId)
  if (('display_name' in expected && profile.display_name !== expected.display_name) || ('avatar_url' in expected && profile.avatar_url !== expected.avatar_url)) {
    throw new Error('资料同步尚未完成，无法确认保存成功。请刷新重试或联系管理员。')
  }
  return profile
}

export async function saveNickname(userId: string, value: string): Promise<Profile> {
  const displayName = value.trim()
  if (!displayName || Array.from(displayName).length > 64) throw new Error('昵称请输入 1 至 64 个字符。')
  await requireCurrentUser(userId)
  const { error } = await getSupabase().auth.updateUser({ data: { display_name: displayName, name: displayName, full_name: displayName } })
  if (error) throw error
  return verifyProfile(userId, { display_name: displayName })
}

export function safeAvatarUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}

export async function validateAvatar(file: File): Promise<'jpg' | 'png' | 'webp'> {
  if (file.size < 1 || file.size > maxAvatarBytes) throw new Error('头像文件不能为空，且不能超过 2 MiB。')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPEG、PNG 或 WebP 格式的图片。')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (file.type === 'image/jpeg' && isJpeg) return 'jpg'
  if (file.type === 'image/png' && isPng) return 'png'
  if (file.type === 'image/webp' && isWebp) return 'webp'
  throw new Error('图片内容与文件格式不符，请重新选择有效图片。')
}

/** Only delete files from this project's public bucket and this user's directory. */
export function ownedAvatarPath(userId: string, value: string | null): string | null {
  if (!value) return null
  try {
    const base = new URL(getSupabase().storage.from(bucketName).getPublicUrl(`${userId}/`).data.publicUrl)
    const url = new URL(value)
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) return null
    const filename = decodeURIComponent(url.pathname.slice(base.pathname.length))
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(filename)) return null
    return `${userId}/${filename}`
  } catch { return null }
}

async function removeAvatar(path: string): Promise<boolean> {
  try { const { error } = await getSupabase().storage.from(bucketName).remove([path]); return !error } catch { return false }
}

export async function saveAvatar(userId: string, file: File | null): Promise<{ profile: Profile; cleanupPending: boolean }> {
  const extension = file ? await validateAvatar(file) : null
  const currentUser = await requireCurrentUser(userId)
  const oldAvatar = typeof currentUser.user_metadata.avatar_url === 'string' ? currentUser.user_metadata.avatar_url : null
  const oldPicture = typeof currentUser.user_metadata.picture === 'string' ? currentUser.user_metadata.picture : null
  const storage = getSupabase().storage.from(bucketName)
  const path = extension ? `${userId}/${crypto.randomUUID()}.${extension}` : null
  let avatarUrl: string | null = null
  if (file && path) {
    const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
    if (error) throw error
    avatarUrl = storage.getPublicUrl(path).data.publicUrl
  }
  // The Auth update and database trigger form the only write path for profile data.
  let profile: Profile
  let updateOutcome: 'unknown' | 'committed' | 'rejected' = 'unknown'
  try {
    await requireCurrentUser(userId)
    const { error } = await getSupabase().auth.updateUser({ data: { avatar_url: avatarUrl, picture: avatarUrl } })
    if (error) {
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 408) updateOutcome = 'rejected'
      throw error
    }
    updateOutcome = 'committed'
    profile = await verifyProfile(userId, { avatar_url: avatarUrl })
  } catch (error) {
    try {
      // A failed response may follow a successful commit. Read the authoritative
      // state before rollback or cleanup, including when updateUser threw.
      const latest = await requireCurrentUser(userId)
      const metadata = latest.user_metadata
      if (metadata.avatar_url === avatarUrl && metadata.picture === avatarUrl) {
        // Do not overwrite another tab's completed avatar update.
        const { error: rollbackError } = await getSupabase().auth.updateUser({ data: { avatar_url: oldAvatar, picture: oldPicture } })
        if (rollbackError) throw rollbackError
        await verifyProfile(userId, { avatar_url: oldAvatar?.trim() || oldPicture?.trim() || null })
        const restored = await requireCurrentUser(userId)
        if (path && (restored.user_metadata.avatar_url === avatarUrl || restored.user_metadata.picture === avatarUrl)) {
          throw new Error('头像仍被账号引用，无法清理。', { cause: error })
        }
      } else if (path) {
        const latestProfile = await readProfile(userId)
        if (metadata.avatar_url === avatarUrl || metadata.picture === avatarUrl || latestProfile.avatar_url === avatarUrl) {
          throw new Error('头像仍被账号引用，无法清理。', { cause: error })
        }
        // A timed-out request may still be processing on the server. An earlier
        // state read alone cannot prove it will never commit this new URL.
        if (updateOutcome === 'unknown') throw new Error('头像更新请求的最终结果尚不明确。', { cause: error })
      }
    } catch (verificationError) {
      throw new Error('头像保存结果未能确认，已保留图片以免丢失。请刷新页面检查后重试。', { cause: verificationError })
    }
    if (path && !(await removeAvatar(path))) throw new Error('头像未保存，上传文件暂未清理。请稍后重试或联系管理员。', { cause: error })
    throw error
  }
  const oldPath = ownedAvatarPath(userId, oldAvatar?.trim() || oldPicture?.trim() || null)
  const cleanupPending = Boolean(oldPath && oldPath !== path && !(await removeAvatar(oldPath)))
  return { profile, cleanupPending }
}
