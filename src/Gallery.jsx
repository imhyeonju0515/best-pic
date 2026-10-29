import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const STRIPES = ['var(--red)', 'var(--yellow)', 'var(--blue)']
const RANK = ['1ST', '2ND', '3RD']

function pad(n) {
  return String(n).padStart(2, '0')
}
function dayKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}
function fmtTime(iso) {
  const d = new Date(iso)
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Heart({ on, count, onClick, big }) {
  return (
    <button
      className={'heart' + (on ? ' on' : '') + (big ? ' big' : '')}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-pressed={on}
      aria-label={on ? '하트 취소' : '하트 누르기'}
    >
      <span className="heart-ico" aria-hidden="true">{on ? '♥' : '♡'}</span>
      <span className="heart-n">{count}</span>
    </button>
  )
}

function VhsCard({ p, rank, likes, comments, mine, onHeart, onOpen }) {
  const stripe = STRIPES[(p.id.charCodeAt(0) + p.id.charCodeAt(1)) % 3]
  return (
    <div className={'vhs' + (rank === 0 ? ' top' : '')} style={{ '--stripe': stripe }}>
      <button className="vhs-open" onClick={onOpen} aria-label={`${p.caption || '제목 없음'} 크게 보기`}>
        <span className="vhs-top">
          <span>{rank != null ? `RANK ${RANK[rank]}` : 'TAPE'}</span>
          <span className="vhs-play">[PLAY TAPE]</span>
        </span>
        <span className="vhs-art">
          {p.url ? <img src={p.url} alt={p.caption || ''} loading="lazy" /> : <span className="skeleton" />}
        </span>
        <span className="vhs-spine">
          <span className="vhs-title">{p.caption || '무제'}</span>
          <span className="vhs-meta">
            <span>{p.nickname || '???'}</span>
            <span>{comments ? `💬${comments}` : fmtTime(p.created_at).slice(6)}</span>
          </span>
        </span>
      </button>
      <span className="vhs-logo">VHS</span>
      {rank != null && <span className={'crown r' + rank}>{rank === 0 ? '👑 1위' : `${rank + 1}위`}</span>}
      <Heart on={mine} count={likes} onClick={onHeart} />
    </div>
  )
}

function Comments({ photoId, me, isAdmin, names, onCount }) {
  const [list, setList] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('id,user_id,body,created_at')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: true })
    if (error) {
      setErr('댓글을 못 불러왔어요: ' + error.message)
      setList([])
      return
    }
    const miss = [...new Set(data.map((c) => c.user_id))].filter((id) => !names.current[id])
    if (miss.length) {
      const { data: ps } = await supabase.from('profiles').select('id,nickname').in('id', miss)
      ps?.forEach((p) => (names.current[p.id] = p.nickname))
    }
    setList(data)
    onCount(photoId, data.length)
  }, [photoId, names, onCount])

  useEffect(() => {
    setList(null)
    setErr('')
    load()
  }, [load])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('comments').insert({ photo_id: photoId, body })
    if (error) setErr('댓글을 못 남겼어요: ' + error.message)
    else {
      setText('')
      names.current[me] ||= '나'
      await load()
    }
    setBusy(false)
  }

  async function del(c) {
    if (!confirm('이 댓글을 지울까요?')) return
    const { error } = await supabase.from('comments').delete().eq('id', c.id)
    if (error) setErr('지우지 못했어요: ' + error.message)
    else await load()
  }

  return (
    <div className="comments">
      <p className="tag">[COMMENTS] {list ? list.length : '…'}</p>
      <ul>
        {list?.map((c) => (
          <li key={c.id}>
            <b>{names.current[c.user_id] || '???'}</b>
            <span className="c-body">{c.body}</span>
            <span className="tag dim c-time">{fmtTime(c.created_at)}</span>
            {(c.user_id === me || isAdmin) && (
              <button className="x sm" onClick={() => del(c)} aria-label="댓글 삭제">
                ×
              </button>
            )}
          </li>
        ))}
        {list && list.length === 0 && <li className="dim">아직 댓글이 없어요. 첫 댓글을 남겨 보세요!</li>}
      </ul>
      {err && <p className="error">{err}</p>}
      <form onSubmit={send} className="c-form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 쓰기" maxLength={300} />
        <button className="btn sm" disabled={busy || !text.trim()}>
          남기기
        </button>
      </form>
    </div>
  )
}

function Lightbox({ items, index, setIndex, me, isAdmin, likes, commentsN, names, onHeart, onCount, onDelete, onClose }) {
  const p = items[index]
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const key = (e) => {
      if (e.target.tagName === 'INPUT') return
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
  const set = likes[p.id]
  async function save() {
    try {
      const blob = await (await fetch(p.url)).blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `best-pic-${dayKey(p.created_at).replaceAll('.', '')}-${p.id.slice(0, 6)}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch {
      window.open(p.url, '_blank')
    }
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={onClose}>
      <div className="crt" onClick={(e) => e.stopPropagation()}>
        <div className="crt-bar">
          <span>
            <b className="rec">●</b> PLAY ▶ {index + 1}/{items.length}
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
              [{p.nickname || '???'}] · {fmtTime(p.created_at)}
            </p>
          </div>
          <div className="crt-actions">
            <Heart big on={set?.has(me)} count={set?.size || 0} onClick={() => onHeart(p.id)} />
            <button className="btn sm" onClick={save}>
              ⬇ 저장
            </button>
            {isAdmin && (
              <button
                className="btn danger sm"
                disabled={busy}
                onClick={async () => {
                  if (!confirm('이 사진을 지울까요? 되돌릴 수 없어요.')) return
                  setBusy(true)
                  await onDelete(p)
                  setBusy(false)
                }}
              >
                {busy ? '지우는 중…' : '삭제 (관리자)'}
              </button>
            )}
          </div>
        </div>
        <Comments key={p.id} photoId={p.id} me={me} isAdmin={isAdmin} names={names} onCount={onCount} />
        <span hidden>{commentsN[p.id]}</span>
      </div>
    </div>
  )
}

export default function Gallery({ session, isAdmin, goUpload }) {
  const me = session.user.id
  const [metas, setMetas] = useState([]) // 사진 정보 전체 (주소 없이)
  const [likes, setLikes] = useState({}) // photo_id -> Set(user_id)
  const [commentsN, setCommentsN] = useState({})
  const [urls, setUrls] = useState({})
  const [active, setActive] = useState(null) // 열린 날짜 폴더
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(-1)
  const names = useRef({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    const [ph, lk, cm] = await Promise.all([
      supabase.from('photos').select('id,user_id,path,caption,created_at').order('created_at', { ascending: false }).range(0, 999),
      supabase.from('likes').select('photo_id,user_id').range(0, 9999),
      supabase.from('comments').select('photo_id').range(0, 9999),
    ])
    if (ph.error) {
      setErr('사진을 불러오지 못했어요: ' + ph.error.message)
      setLoading(false)
      return
    }
    const ids = [...new Set(ph.data.map((p) => p.user_id))]
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id,nickname').in('id', ids)
      ps?.forEach((p) => (names.current[p.id] = p.nickname))
    }
    const lm = {}
    lk.data?.forEach((l) => (lm[l.photo_id] ||= new Set()).add(l.user_id))
    const cn = {}
    cm.data?.forEach((c) => (cn[c.photo_id] = (cn[c.photo_id] || 0) + 1))
    setLikes(lm)
    setCommentsN(cn)
    setMetas(ph.data.map((p) => ({ ...p, nickname: names.current[p.user_id] })))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 날짜 폴더 (최신순). 폴더 안 사진은 하트 많은 순 → 같으면 먼저 올린 순
  const folders = useMemo(() => {
    const map = new Map()
    metas.forEach((p) => {
      const k = dayKey(p.created_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(p)
    })
    return [...map.entries()].map(([date, list]) => {
      const sorted = [...list].sort(
        (a, b) =>
          (likes[b.id]?.size || 0) - (likes[a.id]?.size || 0) || new Date(a.created_at) - new Date(b.created_at)
      )
      const hearts = list.reduce((s, p) => s + (likes[p.id]?.size || 0), 0)
      return { date, list: sorted, hearts }
    })
  }, [metas, likes])

  useEffect(() => {
    if (!active && folders.length) setActive(folders[0].date)
  }, [folders, active])

  const folder = folders.find((f) => f.date === active)

  // 열린 폴더의 사진만 비공개 버킷에서 1시간짜리 임시 주소(signed URL)를 받아 와요
  useEffect(() => {
    if (!folder) return
    const need = folder.list.filter((p) => !urls[p.path]).map((p) => p.path)
    if (!need.length) return
    let dead = false
    supabase.storage
      .from('photos')
      .createSignedUrls(need, 3600)
      .then(({ data }) => {
        if (dead || !data) return
        setUrls((u) => {
          const n = { ...u }
          data.forEach((s) => s.signedUrl && (n[s.path] = s.signedUrl))
          return n
        })
      })
    return () => {
      dead = true
    }
  }, [folder, urls])

  const items = useMemo(() => (folder ? folder.list.map((p) => ({ ...p, url: urls[p.path] })) : []), [folder, urls])

  async function heart(photoId) {
    const had = likes[photoId]?.has(me)
    setLikes((m) => {
      const s = new Set(m[photoId] || [])
      had ? s.delete(me) : s.add(me)
      return { ...m, [photoId]: s }
    })
    const { error } = had
      ? await supabase.from('likes').delete().eq('photo_id', photoId).eq('user_id', me)
      : await supabase.from('likes').insert({ photo_id: photoId })
    if (error) {
      setErr('하트를 저장하지 못했어요: ' + error.message)
      loadAll()
    }
  }

  const setCount = useCallback((id, n) => setCommentsN((c) => (c[id] === n ? c : { ...c, [id]: n })), [])
  const close = useCallback(() => setOpen(-1), [])

  async function remove(p) {
    await supabase.storage.from('photos').remove([p.path])
    const { error } = await supabase.from('photos').delete().eq('id', p.id)
    if (error) {
      alert('삭제하지 못했어요: ' + error.message)
      return
    }
    setMetas((prev) => prev.filter((x) => x.id !== p.id))
    setOpen(-1)
  }

  return (
    <section className="gallery">
      <div className="section-head">
        <div>
          <p className="tag">[ARCHIVE] · {metas.length} TAPES</p>
          <p className="hint">♥ 맘에 드는 사진에 하트를 눌러 주세요</p>
        </div>
        <button className="btn primary" onClick={goUpload}>
          ＋ 사진 올리기
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {!loading && !err && metas.length === 0 && (
        <div className="empty">
          <p className="tag">[NO SIGNAL]</p>
          <p>아직 올라온 사진이 없어요. 첫 번째 테이프를 넣어 볼까요?</p>
          <button className="btn" onClick={goUpload}>
            사진 올리기
          </button>
        </div>
      )}

      {folders.length > 0 && (
        <nav className="folders" aria-label="날짜 폴더">
          {folders.map((f) => (
            <button key={f.date} className={'folder' + (f.date === active ? ' on' : '')} onClick={() => setActive(f.date)}>
              <span className="tag">[DIR]</span>
              <b>{f.date}</b>
              <span className="tag dim">
                {f.list.length}장 · ♥{f.hearts}
              </span>
            </button>
          ))}
        </nav>
      )}

      <div className="vhs-grid">
        {items.map((p, i) => {
          const n = likes[p.id]?.size || 0
          return (
            <VhsCard
              key={p.id}
              p={p}
              rank={n > 0 && i < 3 ? i : null}
              likes={n}
              comments={commentsN[p.id]}
              mine={Boolean(likes[p.id]?.has(me))}
              onHeart={() => heart(p.id)}
              onOpen={() => setOpen(i)}
            />
          )
        })}
        {loading &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={'s' + i} className="vhs ghost-card">
              <span className="skeleton" />
            </div>
          ))}
      </div>

      {open >= 0 && (
        <Lightbox
          items={items}
          index={open}
          setIndex={setOpen}
          me={me}
          isAdmin={isAdmin}
          likes={likes}
          commentsN={commentsN}
          names={names}
          onHeart={heart}
          onCount={setCount}
          onDelete={remove}
          onClose={close}
        />
      )}
    </section>
  )
}
