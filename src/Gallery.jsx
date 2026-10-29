import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const PAGE = 24
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



// 왼쪽 폴더 트리 (폴더 → 날짜 폴더). 관리자는 [EDIT] 로 제목 설정/이동
function FolderTree({ albums, days, scope, setScope, isAdmin, onAddAlbum, onRename, onDeleteAlbum, onMoveDay, onRenameDay, total }) {
  const [edit, setEdit] = useState(false)
  const groups = [
    ...albums.map((a) => ({ id: a.id, title: a.title, days: days.filter((d) => d.album === a.id) })),
    { id: null, title: '미분류', days: days.filter((d) => !d.album || !albums.some((a) => a.id === d.album)) },
  ].filter((g) => g.id || g.days.length || albums.length === 0)

  const sum = (g) => g.days.reduce((s, d) => s + d.count, 0)

  return (
    <aside className="tree" aria-label="폴더">
      <div className="tree-head">
        <span className="tag">[FOLDERS]</span>
        {isAdmin && (
          <button className={'tree-edit' + (edit ? ' on' : '')} onClick={() => setEdit((v) => !v)}>
            [EDIT]
          </button>
        )}
      </div>
      <button className={'node root' + (scope.t === 'all' ? ' on' : '')} onClick={() => setScope({ t: 'all' })}>
        <span>▣ 전체</span>
        <span className="dim">{total}</span>
      </button>

      {groups.map((g) => (
        <div className="tree-album" key={g.id || 'none'}>
          <div className="node-row">
            <button
              className={'node album' + (scope.t === 'album' && scope.id === g.id ? ' on' : '')}
              onClick={() => setScope({ t: 'album', id: g.id })}
            >
              <span>▸ {g.title}</span>
              <span className="dim">{sum(g)}</span>
            </button>
            {edit && g.id && (
              <span className="node-tools">
                <button onClick={() => onRename(g)} aria-label="제목 바꾸기">✎</button>
                <button onClick={() => onDeleteAlbum(g)} aria-label="폴더 삭제">×</button>
              </span>
            )}
          </div>
          <div className="tree-days">
            {g.days.map((d) => (
              <div className="node-row" key={d.day}>
                <button
                  className={'node day' + (scope.t === 'day' && scope.id === d.day ? ' on' : '')}
                  onClick={() => setScope({ t: 'day', id: d.day })}
                >
                  <span>└ {d.label || d.day.slice(2)}</span>
                  <span className="dim">
                    {d.count} · ♥{d.hearts}
                  </span>
                </button>
                {edit && (
                  <button className="day-rename" onClick={() => onRenameDay(d.day)} aria-label="폴더 이름 바꾸기">
                    ✎
                  </button>
                )}
                {edit && (
                  <select
                    className="move"
                    value={g.id || ''}
                    onChange={(e) => onMoveDay(d.day, e.target.value || null)}
                    aria-label={`${d.day} 이동`}
                  >
                    <option value="">미분류</option>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            {g.days.length === 0 && <p className="tag dim empty-dir">(비어 있어요)</p>}
          </div>
        </div>
      ))}

      {edit && (
        <button className="btn sm add-album" onClick={onAddAlbum}>
          ＋ 폴더 추가
        </button>
      )}
    </aside>
  )
}

// 큰 화면: 하트를 가장 많이 받은 사진
function Feature({ p, likes, me, onHeart, onOpen, best }) {
  if (!p) return null
  const n = likes[p.id]?.size || 0
  return (
    <div className="feature">
      <div className="crt-bar feature-bar">
        <span>
          <b className="rec">●</b> {best ? 'BEST PIC ▶ 하트 1위' : 'LATEST ▶ 최신 사진'}
        </span>
        <span>
          {p.nickname || '???'} · {fmtTime(p.created_at)}
        </span>
      </div>
      <button className="feature-glass" onClick={onOpen} aria-label="크게 보기">
        {p.url ? <img src={p.url} alt={p.caption || ''} /> : <span className="skeleton" />}
      </button>
      <div className="feature-info">
        <p className="crt-title">{p.caption || '무제'}</p>
        <Heart big on={Boolean(likes[p.id]?.has(me))} count={n} onClick={() => onHeart(p.id)} />
      </div>
    </div>
  )
}

export default function Gallery({ session, isAdmin, goUpload }) {
  const me = session.user.id
  const [metas, setMetas] = useState([])
  const [likes, setLikes] = useState({})
  const [commentsN, setCommentsN] = useState({})
  const [albums, setAlbums] = useState([])
  const [assign, setAssign] = useState({}) // day -> album_id
  const [labels, setLabels] = useState({}) // day -> 관리자가 붙인 이름
  const [urls, setUrls] = useState({})
  const [scope, setScope] = useState({ t: 'all' })
  const [limit, setLimit] = useState(PAGE)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(-1)
  const names = useRef({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    const [ph, lk, cm, al, ad] = await Promise.all([
      supabase.from('photos').select('id,user_id,path,caption,created_at').order('created_at', { ascending: false }).range(0, 999),
      supabase.from('likes').select('photo_id,user_id').range(0, 9999),
      supabase.from('comments').select('photo_id').range(0, 9999),
      supabase.from('albums').select('id,title').order('created_at', { ascending: true }),
      supabase.from('album_days').select('day,album_id,label'),
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
    const am = {}
    const lb = {}
    ad.data?.forEach((r) => {
      am[r.day] = r.album_id
      if (r.label) lb[r.day] = r.label
    })
    setLabels(lb)
    setLikes(lm)
    setCommentsN(cn)
    setAlbums(al.data || [])
    setAssign(am)
    setMetas(ph.data.map((p) => ({ ...p, nickname: names.current[p.user_id] })))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 날짜 폴더 목록 (최신순)
  const days = useMemo(() => {
    const map = new Map()
    metas.forEach((p) => {
      const k = dayKey(p.created_at)
      const d = map.get(k) || { day: k, label: labels[k] || '', count: 0, hearts: 0, album: assign[k] || null }
      d.count++
      d.hearts += likes[p.id]?.size || 0
      map.set(k, d)
    })
    return [...map.values()].sort((a, b) => b.day.localeCompare(a.day))
  }, [metas, likes, assign, labels])

  // 지금 보고 있는 폴더의 사진들: 하트 많은 순 → 같으면 최신순
  const scoped = useMemo(() => {
    const albumIds = new Set(albums.map((a) => a.id))
    const inScope = metas.filter((p) => {
      const k = dayKey(p.created_at)
      if (scope.t === 'all') return true
      if (scope.t === 'day') return k === scope.id
      const a = assign[k] && albumIds.has(assign[k]) ? assign[k] : null
      return a === scope.id
    })
    return [...inScope].sort(
      (a, b) => (likes[b.id]?.size || 0) - (likes[a.id]?.size || 0) || new Date(b.created_at) - new Date(a.created_at)
    )
  }, [metas, likes, scope, assign, albums])

  const shown = scoped.slice(0, limit)

  useEffect(() => {
    setLimit(PAGE)
  }, [scope])

  // 보이는 사진만 비공개 버킷에서 1시간짜리 임시 주소(signed URL)를 받아 와요
  useEffect(() => {
    const need = shown.filter((p) => !urls[p.path]).map((p) => p.path)
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
  }, [shown, urls])

  const items = useMemo(() => shown.map((p) => ({ ...p, url: urls[p.path] })), [shown, urls])
  const topLikes = items[0] ? likes[items[0].id]?.size || 0 : 0
  const featured = topLikes > 0 ? items[0] : [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  const featuredIdx = featured ? items.indexOf(featured) : -1
  const rest = items.map((p, i) => ({ p, i })).filter(({ i }) => i !== featuredIdx)

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

  // ---- 관리자: 폴더 만들기 / 제목 바꾸기 / 삭제 / 날짜 폴더 이동 ----
  async function addAlbum() {
    const title = prompt('새 폴더 제목을 적어 주세요 (30자 이내)')?.trim()
    if (!title) return
    const { error } = await supabase.from('albums').insert({ title: title.slice(0, 30) })
    if (error) setErr('폴더를 못 만들었어요: ' + error.message)
    else loadAll()
  }
  async function renameAlbum(g) {
    const title = prompt('폴더 제목', g.title)?.trim()
    if (!title || title === g.title) return
    const { error } = await supabase.from('albums').update({ title: title.slice(0, 30) }).eq('id', g.id)
    if (error) setErr('제목을 못 바꿨어요: ' + error.message)
    else loadAll()
  }
  async function deleteAlbum(g) {
    if (!confirm(`폴더 '${g.title}' 를 지울까요? 안의 날짜 폴더는 "미분류"로 가고, 사진은 지워지지 않아요.`)) return
    const { error } = await supabase.from('albums').delete().eq('id', g.id)
    if (error) setErr('삭제하지 못했어요: ' + error.message)
    else {
      setScope({ t: 'all' })
      loadAll()
    }
  }
  async function renameDay(day) {
    const label = prompt('폴더 이름 (비우면 날짜로 돌아가요)', labels[day] || day)?.trim()
    if (label === undefined || label === null) return
    const next = label === day ? '' : label.slice(0, 30)
    const { error } = await supabase.from('album_days').upsert({ day, album_id: assign[day] || null, label: next || null })
    if (error) setErr('이름을 못 바꿨어요: ' + error.message)
    else setLabels((l) => ({ ...l, [day]: next }))
  }
  async function moveDay(day, albumId) {
    const { error } = await supabase.from('album_days').upsert({ day, album_id: albumId, label: labels[day] || null })
    if (error) setErr('이동하지 못했어요: ' + error.message)
    else setAssign((a) => ({ ...a, [day]: albumId }))
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

  const scopeName =
    scope.t === 'all'
      ? '전체'
      : scope.t === 'day'
        ? labels[scope.id] || scope.id
        : albums.find((a) => a.id === scope.id)?.title || '미분류'

  return (
    <section className="gallery">
      <div className="section-head">
        <div>
          <p className="tag">
            [ARCHIVE] · {scopeName} · {scoped.length} TAPES
          </p>
          <p className="hint">♥ 맘에 드는 사진에 하트를 눌러 주세요</p>
        </div>
        <button className="btn primary" onClick={goUpload}>
          ＋ 사진 올리기
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      <div className="gal-layout">
        <FolderTree
          albums={albums}
          days={days}
          scope={scope}
          setScope={setScope}
          isAdmin={isAdmin}
          total={metas.length}
          onAddAlbum={addAlbum}
          onRename={renameAlbum}
          onDeleteAlbum={deleteAlbum}
          onMoveDay={moveDay}
          onRenameDay={renameDay}
        />

        <div className="gal-main">
          {!loading && !err && scoped.length === 0 && (
            <div className="empty">
              <p className="tag">[NO SIGNAL]</p>
              <p>{metas.length === 0 ? '아직 올라온 사진이 없어요. 첫 번째 테이프를 넣어 볼까요?' : '이 폴더는 비어 있어요.'}</p>
              {metas.length === 0 && (
                <button className="btn" onClick={goUpload}>
                  사진 올리기
                </button>
              )}
            </div>
          )}

          <Feature
            p={featured}
            best={topLikes > 0}
            likes={likes}
            me={me}
            onHeart={heart}
            onOpen={() => setOpen(featuredIdx)}
          />

          <div className="vhs-grid">
            {rest.map(({ p, i }) => {
              const n = likes[p.id]?.size || 0
              const rank = topLikes > 0 && n > 0 && i < 3 ? i : null
              return (
                <VhsCard
                  key={p.id}
                  p={p}
                  rank={rank}
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

          {scoped.length > limit && (
            <div className="center-text">
              <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                ▼ 더 보기 ({scoped.length - limit})
              </button>
            </div>
          )}
        </div>
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
