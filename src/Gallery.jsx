import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const PAGE = 24
const STRIPES = ['var(--red)', 'var(--yellow)', 'var(--blue)']

function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function tapeNo(i, total) {
  return String(total - i).padStart(3, '0')
}

function VhsCard({ p, i, total, onOpen }) {
  const stripe = STRIPES[(p.id.charCodeAt(0) + p.id.charCodeAt(1)) % 3]
  return (
    <button className="vhs" onClick={onOpen} style={{ '--stripe': stripe }} aria-label={`${p.caption || '제목 없음'} 크게 보기`}>
      <span className="vhs-top">
        <span>TAPE #{tapeNo(i, total)}</span>
        <span className="vhs-play">[PLAY TAPE]</span>
      </span>
      <span className="vhs-art">
        {p.url ? <img src={p.url} alt={p.caption || ''} loading="lazy" /> : <span className="skeleton" />}
      </span>
      <span className="vhs-spine">
        <span className="vhs-title">{p.caption || '무제'}</span>
        <span className="vhs-meta">
          <span>{p.nickname || '???'}</span>
          <span>{fmtDate(p.created_at)}</span>
        </span>
        <span className="vhs-logo">VHS</span>
      </span>
    </button>
  )
}

function Lightbox({ items, index, setIndex, me, isAdmin, onDelete, onClose }) {
  const p = items[index]
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex((v) => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setIndex((v) => Math.min(items.length - 1, v + 1))
    }
    window.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', key)
      document.body.style.overflow = ''
    }
  }, [items.length, onClose, setIndex])

  if (!p) return null
  const mine = p.user_id === me
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={onClose}>
      <div className="crt" onClick={(e) => e.stopPropagation()}>
        <div className="crt-bar">
          <span>
            <b className="rec">●</b> PLAY ▶ #{tapeNo(index, items.length)}
          </span>
          <button ref={ref} onClick={onClose} aria-label="닫기">
            [CLOSE ×]
          </button>
        </div>
        <div className="crt-glass">
          <img src={p.url} alt={p.caption || ''} />
          {index > 0 && (
            <button className="crt-nav prev" onClick={() => setIndex(index - 1)} aria-label="이전 사진">
              ◀
            </button>
          )}
          {index < items.length - 1 && (
            <button className="crt-nav next" onClick={() => setIndex(index + 1)} aria-label="다음 사진">
              ▶
            </button>
          )}
        </div>
        <div className="crt-info">
          <div>
            <p className="crt-title">{p.caption || '무제'}</p>
            <p className="tag dim">
              [{p.nickname || '???'}] · {fmtDate(p.created_at)}
            </p>
          </div>
          {(mine || isAdmin) && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm('이 사진을 지울까요? 되돌릴 수 없어요.')) return
                setBusy(true)
                await onDelete(p)
                setBusy(false)
              }}
            >
              {busy ? '지우는 중…' : mine ? '내 사진 삭제' : '삭제 (관리자)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Gallery({ session, isAdmin, goUpload }) {
  const me = session.user.id
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(-1)
  const names = useRef({})

  const load = useCallback(
    async (from) => {
      setLoading(true)
      setErr('')
      const { data, error } = await supabase
        .from('photos')
        .select('id,user_id,path,caption,created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) {
        setErr('사진을 불러오지 못했어요: ' + error.message)
        setLoading(false)
        return
      }
      // 닉네임
      const ids = [...new Set(data.map((p) => p.user_id))].filter((id) => !names.current[id])
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('id,nickname').in('id', ids)
        ps?.forEach((p) => (names.current[p.id] = p.nickname))
      }
      // 비공개 버킷이라 1시간짜리 임시 주소(signed URL)를 받아 와요
      let urls = {}
      if (data.length) {
        const { data: signed } = await supabase.storage.from('photos').createSignedUrls(
          data.map((p) => p.path),
          3600
        )
        signed?.forEach((s) => (urls[s.path] = s.signedUrl))
      }
      const rows = data.map((p) => ({ ...p, url: urls[p.path], nickname: names.current[p.user_id] }))
      setItems((prev) => (from === 0 ? rows : [...prev, ...rows]))
      setMore(data.length === PAGE)
      setLoading(false)
    },
    []
  )

  useEffect(() => {
    load(0)
  }, [load])

  const close = useCallback(() => setOpen(-1), [])

  async function remove(p) {
    await supabase.storage.from('photos').remove([p.path])
    const { error } = await supabase.from('photos').delete().eq('id', p.id)
    if (error) {
      alert('삭제하지 못했어요: ' + error.message)
      return
    }
    setItems((prev) => prev.filter((x) => x.id !== p.id))
    setOpen(-1)
  }

  return (
    <section className="gallery">
      <div className="section-head">
        <div>
          <p className="tag">[ARCHIVE] · {items.length}{more ? '+' : ''} TAPES</p>
          <h1 className="big-title">
            우리의 <em>베스트 사진</em>
          </h1>
        </div>
        <button className="btn primary" onClick={goUpload}>
          ＋ 사진 올리기
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {!loading && !err && items.length === 0 && (
        <div className="empty">
          <p className="tag">[NO SIGNAL]</p>
          <p>아직 올라온 사진이 없어요. 첫 번째 테이프를 넣어 볼까요?</p>
          <button className="btn" onClick={goUpload}>
            사진 올리기
          </button>
        </div>
      )}

      <div className="vhs-grid">
        {items.map((p, i) => (
          <VhsCard key={p.id} p={p} i={i} total={items.length} onOpen={() => setOpen(i)} />
        ))}
        {loading && Array.from({ length: items.length ? 3 : 8 }, (_, i) => <div key={'s' + i} className="vhs ghost-card"><span className="skeleton" /></div>)}
      </div>

      {more && !loading && (
        <div className="center-text">
          <button className="btn" onClick={() => load(items.length)}>
            ▼ 더 보기
          </button>
        </div>
      )}

      {open >= 0 && (
        <Lightbox items={items} index={open} setIndex={setOpen} me={me} isAdmin={isAdmin} onDelete={remove} onClose={close} />
      )}
    </section>
  )
}
