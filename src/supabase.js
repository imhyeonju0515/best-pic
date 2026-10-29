import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseReady = Boolean(url && key)
export const supabase = supabaseReady ? createClient(url, key) : null

// ---- 닉네임 → 합성 이메일 (이메일 없이 닉네임으로 가입하기 위한 꼼수) ----
// 닉네임을 UTF-8 hex 로 바꿔서 u<hex>@bestpic.local 로 만듭니다.
export const FAKE_DOMAIN = 'bestpic.local'
export const NICK_RE = /^[0-9A-Za-z_가-힣]{2,10}$/

export function nickToEmail(nick) {
  const bytes = new TextEncoder().encode(nick.trim())
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `u${hex}@${FAKE_DOMAIN}`
}

// 영어 오류 메시지를 쉬운 한국어로
export function friendlyError(err) {
  const m = String(err?.message || err || '').toLowerCase()
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('database error saving')) {
    return '이미 사용 중인 닉네임이에요. 다른 닉네임을 써 주세요.'
  }
  if (m.includes('invalid login')) return '닉네임이나 비밀번호가 맞지 않아요.'
  if (m.includes('rate limit') || m.includes('too many')) return '요청이 너무 많아요. 잠시 후 다시 해 주세요.'
  if (m.includes('password') && m.includes('6')) return '비밀번호는 6자 이상이어야 해요.'
  if (m.includes('invalid path')) return '설정 오류: VITE_SUPABASE_URL 에는 https://….supabase.co 도메인만 넣어 주세요.'
  if (m.includes('email') && m.includes('invalid')) return '설정 오류: 가짜 이메일 도메인이 거부됐어요. README 의 "문제 해결"을 확인해 주세요.'
  if (m.includes('failed to fetch') || m.includes('network')) return '네트워크에 연결되지 않아요. 인터넷을 확인해 주세요.'
  return '앗, 문제가 생겼어요: ' + (err?.message || err)
}
