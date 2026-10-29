import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// 레트로 CRT 모니터 + 떠다니는 VHS 테이프 (Three.js r160)
// - 화면 밖이면 멈춤, prefers-reduced-motion 이면 한 장면만 그림, 좁은 화면은 약간 작게
function drawScreen(ctx, w, h, label, t, sub) {
  ctx.fillStyle = '#07090c'
  ctx.fillRect(0, 0, w, h)
  const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7)
  g.addColorStop(0, 'rgba(60,70,120,0.55)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // 컬러바
  const bars = ['#e8e8e8', '#f2c200', '#27c2c2', '#2fbf4a', '#d63ad6', '#e8362d', '#2f6df2']
  const bw = w / bars.length
  bars.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.globalAlpha = 0.85
    ctx.fillRect(i * bw, 0, bw + 1, h * 0.14)
  })
  ctx.globalAlpha = 1

  ctx.fillStyle = '#f1efe9'
  ctx.textAlign = 'center'
  ctx.font = `italic ${Math.round(h * 0.2)}px "Instrument Serif", Georgia, serif`
  ctx.fillText(label, w / 2, h * 0.56)
  ctx.font = `${Math.round(h * 0.055)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = '#9ca3b5'
  ctx.fillText(sub, w / 2, h * 0.68)

  const s = Math.floor(t) % 3600
  const tc = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(Math.floor((t % 1) * 24)).padStart(2, '0')}`
  ctx.textAlign = 'left'
  ctx.fillStyle = '#e8362d'
  ctx.fillText(Math.floor(t * 2) % 2 ? '● REC' : '  REC', w * 0.06, h * 0.9)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#f1efe9'
  ctx.fillText(tc, w * 0.94, h * 0.9)

  // 스캔라인 + 지직 노이즈
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2)
  if (Math.random() < 0.25) {
    const y = Math.random() * h
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(0, y, w, 2 + Math.random() * 6)
  }
}

export default function Hero3D({ label = 'best pic', sub = '▶ PLAY' }) {
  const mount = useRef(null)

  useEffect(() => {
    const el = mount.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
    camera.position.set(0, 0.25, 8)

    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x181410, 1.1))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 4, 5)
    scene.add(key)
    const rimR = new THREE.PointLight(0xe8362d, 18, 12)
    rimR.position.set(-4, 1, -2)
    scene.add(rimR)
    const rimB = new THREE.PointLight(0x2f6df2, 18, 12)
    rimB.position.set(4, 2, -2)
    scene.add(rimB)

    const body = new THREE.MeshStandardMaterial({ color: 0xe9e5db, roughness: 0.55, metalness: 0.05 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.7 })
    const grey = new THREE.MeshStandardMaterial({ color: 0xbdb9ae, roughness: 0.6 })

    const mon = new THREE.Group()
    // 앞 몸통 + 뒤 몸통(좁아짐)
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.15, 0.9), body)
    mon.add(front)
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.6, 1.4), body)
    back.position.z = -1.1
    mon.add(back)
    // 환기구
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.05), grey)
      v.position.set(0.05, 0.45 - i * 0.13, -1.82)
      mon.add(v)
    }
    // 화면 틀(어두운 베젤)
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.78, 0.1), dark)
    bezel.position.z = 0.43
    mon.add(bezel)

    // 곡면 화면
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = 384
    const ctx = cv.getContext('2d')
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const geo = new THREE.PlaneGeometry(1.95, 1.5, 24, 18)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      pos.setZ(i, 0.16 - (x * x * 0.1 + y * y * 0.12))
    }
    geo.computeVertexNormals()
    const screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }))
    screen.position.z = 0.5
    mon.add(screen)
    // 유리 반사
    const glass = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.2 })
    )
    glass.position.z = 0.53
    mon.add(glass)

    // 앞 버튼/LED
    ;[-0.2, 0.05].forEach((x) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 20), grey)
      b.rotation.x = Math.PI / 2
      b.position.set(x + 0.55, -0.98, 0.47)
      mon.add(b)
    })
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe8362d }))
    led.position.set(1.0, -0.98, 0.47)
    mon.add(led)

    // 받침대
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.18, 32), grey)
    stand.position.y = -1.2
    mon.add(stand)
    mon.position.y = 0.35
    mon.scale.setScalar(0.9)
    scene.add(mon)

    // VHS 테이프
    const tape = new THREE.Group()
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.85), dark)
    tape.add(shell)
    const lab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.01, 0.5), new THREE.MeshStandardMaterial({ color: 0xf1efe9 }))
    lab.position.set(0, 0.116, 0.05)
    tape.add(lab)
    ;[0xe8362d, 0xf2c200, 0x2f6df2].forEach((c, i) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.07), new THREE.MeshBasicMaterial({ color: c }))
      s.position.set(0, 0.122, -0.1 + i * 0.1)
      tape.add(s)
    })
    ;[-0.4, 0.4].forEach((x) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xcfcfcf }))
      r.position.set(x, 0.112, -0.28)
      tape.add(r)
    })
    tape.scale.setScalar(0.8)
    scene.add(tape)

    let narrow = false
    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 300
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      narrow = w < 520
      camera.position.z = narrow ? 10 : 8
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const pointer = { x: 0, y: 0 }
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2
      pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2
    }
    if (!reduce) window.addEventListener('pointermove', onMove, { passive: true })

    const clock = new THREE.Clock()
    let raf = 0
    let visible = true
    let lastTex = 0
    const frame = () => {
      const t = clock.getElapsedTime()
      if (!reduce) {
        mon.rotation.y += ((Math.sin(t * 0.45) * 0.55 + pointer.x * 0.35) - mon.rotation.y) * 0.06
        mon.rotation.x += ((pointer.y * 0.12) - mon.rotation.x) * 0.06
        const a = t * 0.7
        const rad = narrow ? 2.1 : 3
        tape.position.set(Math.cos(a) * rad, 0.9 + Math.sin(t * 1.3) * 0.25, Math.sin(a) * rad * 0.6 - 0.6)
        tape.rotation.set(0.4, a + 0.8, Math.sin(t) * 0.2)
        led.visible = Math.floor(t * 1.5) % 2 === 0
      }
      if (t - lastTex > 0.1) {
        lastTex = t
        drawScreen(ctx, 512, 384, label, 136 + t, sub)
        tex.needsUpdate = true
      }
      renderer.render(scene, camera)
      if (!reduce && visible) raf = requestAnimationFrame(frame)
    }
    tape.position.set(2.4, 0.9, -0.4)
    tape.rotation.set(0.4, 0.8, 0.1)

    let io
    if (reduce) {
      frame()
    } else {
      io = new IntersectionObserver(([e]) => {
        const was = visible
        visible = e.isIntersecting
        if (visible && !was) raf = requestAnimationFrame(frame)
      })
      io.observe(el)
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      scene.traverse((o) => {
        o.geometry?.dispose?.()
        const m = o.material
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.())
      })
      tex.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [label, sub])

  return <div className="hero3d" ref={mount} role="img" aria-label="빙글 도는 레트로 CRT 모니터와 VHS 테이프" />
}
