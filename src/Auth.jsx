import { useState } from 'react'
import { supabase, nickToEmail, NICK_RE, friendlyError } from './supabase.js'

export default function Auth() {
  const [mode, setMode] = useState('signup') // 'signup' | 'login'
  const [nick, setNick] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const isSignup = mode === 'signup'

  async function submit(e) {
    e.preventDefault()
    setMsg('')
    const nickname = nick.trim()
    if (!NICK_RE.test(nickname)) {
      setMsg('닉네임은 한글·영문·숫자·_ 로 2~10자예요. (공백, 이모지는 안 돼요)')
      return
    }
    if (pw.length < 6) {
      setMsg('비밀번호는 6자 이상으로 해 주세요.')
      return
    }
    setBusy(true)
    const email = nickToEmail(nickname)
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: { data: { nickname } },
        })
        if (error) throw error
        if (!data.session) {
          // Confirm email 이 켜져 있으면 세션이 안 생겨요
          setMsg('가입은 됐지만 로그인이 안 됐어요. Supabase 에서 "Confirm email" 을 꺼야 해요. (README 4단계)')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      }
    } catch (err) {
      setMsg(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel auth">
      <p className="tag">{isSignup ? '[NEW MEMBER]' : '[MEMBER LOGIN]'}</p>
      <h1 className="big-title">
        <em>주주친구들</em>
      </h1>
      <p className="lead">
        닉네임만 정하면 끝! 가입 요청을 보내면 관리자가 승인해 줘요. 이메일은 필요 없어요.
      </p>

      <form onSubmit={submit} className="form">
        <label>
          <span className="tag">[NICKNAME]</span>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="예: 귤친구"
            maxLength={10}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label>
          <span className="tag">[PASSWORD]</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="6자 이상"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {msg && (
          <p className="error" role="alert">
            {msg}
          </p>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? '보내는 중…' : isSignup ? '▶ 가입 요청 보내기' : '▶ 로그인'}
        </button>
      </form>

      <button
        className="link"
        onClick={() => {
          setMode(isSignup ? 'login' : 'signup')
          setMsg('')
        }}
      >
        {isSignup ? '이미 가입했어요 → 로그인' : '처음이에요 → 가입 요청'}
      </button>
    </section>
  )
}
