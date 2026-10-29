import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const LABEL = { pending: '대기', approved: '승인됨', rejected: '거절됨' }
const ORDER = { pending: 0, approved: 1, rejected: 2 }

function fmt(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Admin({ me }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) setMsg('목록을 못 불러왔어요: ' + error.message)
    else
      setRows(
        [...data].sort((a, b) => ORDER[a.status] - ORDER[b.status] || new Date(b.created_at) - new Date(a.created_at))
      )
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(r, status) {
    setWorking(r.id)
    setMsg('')
    const { error } = await supabase.rpc('admin_set_status', { target: r.id, new_status: status })
    if (error) setMsg('실패: ' + error.message)
    await load()
    setWorking('')
  }

  async function del(r) {
    if (!confirm(`'${r.nickname}' 님과 올린 사진을 모두 삭제할까요? 되돌릴 수 없어요.`)) return
    setWorking(r.id)
    setMsg('')
    // 사진 파일부터 지우고, 그다음 계정을 지워요
    const { data: ph } = await supabase.from('photos').select('path').eq('user_id', r.id)
    if (ph?.length) await supabase.storage.from('photos').remove(ph.map((p) => p.path))
    const { error } = await supabase.rpc('admin_delete_user', { target: r.id })
    if (error) setMsg('실패: ' + error.message)
    await load()
    setWorking('')
  }

  const pending = rows.filter((r) => r.status === 'pending').length

  return (
    <section className="admin">
      <div className="section-head">
        <div>
          <p className="tag">[CONTROL ROOM] · PENDING {pending}</p>
          <h1 className="big-title">
            가입 <em>승인</em> 관리
          </h1>
        </div>
        <button className="btn" onClick={load}>
          ↻ 새로고침
        </button>
      </div>

      {msg && <p className="error">{msg}</p>}
      {loading && <p className="tag">[LOADING…]</p>}

      <ul className="mem-list">
        {rows.map((r) => (
          <li key={r.id} className={'mem ' + r.status}>
            <div className="mem-who">
              <b>{r.nickname}</b>
              {r.is_admin && <span className="chip">ADMIN</span>}
              <span className={'chip st-' + r.status}>{LABEL[r.status]}</span>
              <span className="tag dim">{fmt(r.created_at)}</span>
            </div>
            {r.id !== me && (
              <div className="mem-act">
                {r.status !== 'approved' && (
                  <button className="btn primary sm" disabled={working === r.id} onClick={() => setStatus(r, 'approved')}>
                    승인
                  </button>
                )}
                {r.status !== 'rejected' && (
                  <button className="btn sm" disabled={working === r.id} onClick={() => setStatus(r, 'rejected')}>
                    거절
                  </button>
                )}
                <button className="btn danger sm" disabled={working === r.id} onClick={() => del(r)}>
                  삭제
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
