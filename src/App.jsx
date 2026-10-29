import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, supabaseReady } from './supabase.js'
import Auth from './Auth.jsx'
import Gallery from './Gallery.jsx'
import Upload from './Upload.jsx'
import Admin from './Admin.jsx'

const Hero3D = lazy(() => import('./Hero3D.jsx'))

function pad(n) {
  return String(n).padStart(2, '0')
}

function useTimecode() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setS((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  return `${pad(now.getHours())}:${pad(now.getMinutes())} KST`
}

function Logo() {
  return (
    <span className="logo" aria-label="best pic">
      <span className="logo-bars" aria-hidden="true">
        <i style={{ background: 'var(--red)' }} />
        <i style={{ background: 'var(--yellow)' }} />
        <i style={{ background: 'var(--blue)' }} />
      </span>
      <span className="logo-text">best pic</span>
      <span className="logo-sub">[VOL.01]</span>
    </span>
  )
}

function Hero({ label, sub }) {
  return (
    <div className="hero-wrap">
      <Suspense fallback={<div className="hero3d hero-loading">[LOADING…]</div>}>
        <Hero3D label={label} sub={sub} />
      </Suspense>
    </div>
  )
}

function Notice({ title, children }) {
  return (
    <section className="panel center-panel">
      <p className="tag">[NOTICE]</p>
      <h1 className="big-title">{title}</h1>
      <div className="prose">{children}</div>
    </section>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [booting, setBooting] = useState(supabaseReady)
  const [view, setView] = useState('gallery')
  const [bw, setBw] = useState(() => {
    try {
      return localStorage.getItem('bestpic-bw') === '1'
    } catch {
      return false
    }
  })
  const tc = useTimecode()
  const clock = useClock()

  useEffect(() => {
    document.documentElement.classList.toggle('bw', bw)
    try {
      localStorage.setItem('bestpic-bw', bw ? '1' : '0')
    } catch {
      /* 저장 못 해도 괜찮아요 */
    }
  }, [bw])

  // 로그인 상태 감시
  useEffect(() => {
    if (!supabaseReady) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setBooting(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setView('gallery')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async () => {
    if (!session) return
    for (let i = 0; i < 3; i++) {
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (data) {
        setProfile(data)
        break
      }
      await new Promise((r) => setTimeout(r, 600))
    }
    setBooting(false)
  }, [session])

  const uid = session?.user?.id
  useEffect(() => {
    if (uid) loadProfile()
  }, [uid, loadProfile])

  // 승인 대기 중이면 15초마다 상태 확인
  useEffect(() => {
    if (profile?.status !== 'pending') return
    const id = setInterval(loadProfile, 15000)
    return () => clearInterval(id)
  }, [profile?.status, loadProfile])

  const logout = () => supabase.auth.signOut()
  const approved = profile?.status === 'approved'

  let body
  if (!supabaseReady) {
    body = (
      <Notice title="아직 연결이 안 됐어요">
        <p>
          Supabase 환경변수가 없어요. <code>.env</code> 파일(또는 Vercel 환경변수)에 <code>VITE_SUPABASE_URL</code> 과{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> 를 넣어 주세요. 자세한 방법은 README 를 보세요.
        </p>
      </Notice>
    )
  } else if (booting) {
    body = <p className="tag center-text">[LOADING TAPE…]</p>
  } else if (!session) {
    body = (
      <div className="landing">
        <Hero label="best pic" sub="▶ PLAY" />
        <Auth />
      </div>
    )
  } else if (!profile) {
    body = (
      <Notice title="프로필을 못 찾았어요">
        <p>
          SQL 이 아직 실행되지 않았을 수 있어요. README 의 2단계를 확인한 뒤 다시 로그인해 주세요.
        </p>
        <button className="btn" onClick={logout}>
          로그아웃
        </button>
      </Notice>
    )
  } else if (profile.status === 'pending') {
    body = (
      <div className="landing">
        <Hero label="WAITING…" sub="■ STANDBY" />
        <section className="panel">
          <p className="tag">[STATUS: PENDING]</p>
          <h1 className="big-title">
            승인 대기 중
            <br />
            <em>{profile.nickname}</em> 님
          </h1>
          <div className="prose">
            <p>가입 요청이 잘 접수됐어요! 관리자가 승인하면 사진을 보고 올릴 수 있어요.</p>
            <p className="dim">이 화면은 15초마다 자동으로 확인해요. 승인되면 알아서 바뀝니다.</p>
          </div>
          <div className="row">
            <button className="btn" onClick={loadProfile}>
              지금 확인하기
            </button>
            <button className="btn ghost" onClick={logout}>
              로그아웃
            </button>
          </div>
        </section>
      </div>
    )
  } else if (profile.status === 'rejected') {
    body = (
      <Notice title="가입이 거절됐어요">
        <p>관리자가 이 요청을 받아들이지 않았어요. 아는 사람이라면 관리자에게 직접 물어보세요.</p>
        <button className="btn" onClick={logout}>
          로그아웃
        </button>
      </Notice>
    )
  } else if (view === 'upload') {
    body = <Upload session={session} onDone={() => setView('gallery')} />
  } else if (view === 'admin' && profile.is_admin) {
    body = <Admin me={session.user.id} />
  } else {
    body = <Gallery session={session} isAdmin={profile.is_admin} goUpload={() => setView('upload')} />
  }

  return (
    <div className="stage">
      <header className="menubar">
        <button className="menu-left" onClick={() => setView('gallery')} aria-label="처음으로">
          <span className="menu-dot" aria-hidden="true" />
          <span className="menu-home">HOME</span>
          <span className="menu-tc" aria-hidden="true">{tc}</span>
        </button>
        <Logo />
        <nav className="menu-right" aria-label="메뉴">
          {approved && (
            <>
              <button className={view === 'gallery' ? 'on' : ''} onClick={() => setView('gallery')}>
                GALLERY
              </button>
              <button className={view === 'upload' ? 'on' : ''} onClick={() => setView('upload')}>
                UPLOAD
              </button>
              {profile.is_admin && (
                <button className={view === 'admin' ? 'on' : ''} onClick={() => setView('admin')}>
                  ADMIN
                </button>
              )}
            </>
          )}
          {session && (
            <button onClick={logout} className="menu-out">
              LOGOUT
            </button>
          )}
        </nav>
      </header>

      <main className="screen">{body}</main>

      <footer className="statusbar">
        <span>{clock}</span>
        <button className="bw-toggle" onClick={() => setBw((v) => !v)} aria-pressed={bw}>
          B&amp;W <b>[{bw ? 'ON' : 'OFF'}]</b>
        </button>
        <span className="hide-sm">{profile ? `SOURCE: ${profile.nickname}` : 'SOURCE: FRIENDS ONLY'}</span>
        <span className="hide-sm">© BEST PIC</span>
      </footer>

      <div className="fx fx-grain" aria-hidden="true" />
      <div className="fx fx-scan" aria-hidden="true" />
      <div className="fx fx-vignette" aria-hidden="true" />
    </div>
  )
}
