'use client'

import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Singleton — MediaPipe WASM doesn't support concurrent instances across components
let _landmarkerPromise: Promise<FaceLandmarker> | null = null
function getLandmarker(): Promise<FaceLandmarker> {
  if (!_landmarkerPromise) {
    _landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
      )
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        outputFaceBlendshapes: false,
        runningMode: 'IMAGE',
        numFaces: 1,
      })
    })()
  }
  return _landmarkerPromise
}

const LMKS: Record<string, number[]> = {
  leftEye:    [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  rightEye:   [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  forehead:   [10, 151, 9, 8, 168, 107, 66, 336, 296, 67, 109, 338, 297],
  leftCheek:  [234, 93, 132, 58, 172, 136, 150, 149, 176, 148],
  rightCheek: [454, 323, 361, 288, 397, 365, 379, 378, 400, 377],
  lips:       [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  nose:       [1, 2, 19, 94, 4, 5, 197, 168, 6, 218, 219, 220, 438, 439, 440],
  fullFace:   [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
               152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
}

interface SymptomDef {
  zones: string[]
  label: string        // clinical term — doctor view & canvas annotation
  laymanLabel: string  // plain-English name — patient view chip
  laymanDesc: string   // what it might mean in plain language
  redFlag: boolean
  pad: number
}

const SYMPTOM_MAP: Record<string, SymptomDef> = {
  // ── Fluid & Pressure ─────────────────────────────────────────────────────
  'periorbital edema': {
    zones: ['leftEye', 'rightEye'], label: 'Periorbital Edema', redFlag: true, pad: 0.06,
    laymanLabel: 'Swelling around eyes',
    laymanDesc: 'Puffiness around your eyes after delivery can be a sign your kidneys are not filtering fluid properly, or may be linked to high blood pressure — a condition called preeclampsia that can develop even weeks after birth.',
  },
  'facial edema': {
    zones: ['fullFace'], label: 'Facial Edema', redFlag: true, pad: 0.02,
    laymanLabel: 'Face swelling',
    laymanDesc: 'Swelling across the whole face is a warning sign of fluid retention from high blood pressure or preeclampsia. Combined with headache or visual changes, this needs urgent evaluation.',
  },
  'thyroid puffiness': {
    zones: ['fullFace'], label: 'Generalized Facial Puffiness (Possible Hypothyroid Facies)', redFlag: false, pad: 0.02,
    laymanLabel: 'Puffy or bloated face',
    laymanDesc: 'A generally puffy face that developed gradually after delivery can be a sign of an underactive thyroid (hypothyroidism), which is very common in new mothers and is easily treated once diagnosed.',
  },
  // ── Skin Color Changes ───────────────────────────────────────────────────
  'pallor': {
    zones: ['fullFace'], label: 'Pallor', redFlag: true, pad: 0.02,
    laymanLabel: 'Pale or washed-out skin',
    laymanDesc: 'Unusual paleness can be a sign of low blood count (anemia) or blood loss — both common after delivery. Severe pallor can mean your body is not getting enough oxygen to your tissues.',
  },
  'lip pallor': {
    zones: ['lips'], label: 'Lip Pallor / Mucosal Pallor', redFlag: true, pad: 0.04,
    laymanLabel: 'Pale lips',
    laymanDesc: 'Whitish or very pale lips are a reliable sign of significant blood loss or severely low red blood cell count (anemia). This level of pallor needs prompt evaluation.',
  },
  'conjunctival pallor': {
    zones: ['leftEye', 'rightEye'], label: 'Conjunctival Pallor', redFlag: true, pad: 0.07,
    laymanLabel: 'Pale inner eyelids',
    laymanDesc: 'When the inner lining of your lower eyelid looks pale or whitish instead of healthy pink, it is one of the most accurate signs of significant anemia and low red blood cell count.',
  },
  'jaundice': {
    zones: ['forehead', 'leftCheek', 'rightCheek'], label: 'Jaundice', redFlag: true, pad: 0.03,
    laymanLabel: 'Yellow tint to skin',
    laymanDesc: 'A yellow color in the skin signals your liver is under serious stress. After delivery this can be related to HELLP syndrome — a dangerous condition affecting the liver and blood clotting that requires emergency care.',
  },
  'scleral icterus': {
    zones: ['leftEye', 'rightEye'], label: 'Scleral Icterus', redFlag: true, pad: 0.07,
    laymanLabel: 'Yellow whites of eyes',
    laymanDesc: 'Yellowing of the white part of the eyes is often the earliest and most obvious sign of liver problems. In the postpartum period this raises immediate concern for HELLP syndrome or hepatic dysfunction.',
  },
  'cyanosis': {
    zones: ['lips'], label: 'Cyanosis', redFlag: true, pad: 0.04,
    laymanLabel: 'Blue or purple lips',
    laymanDesc: 'A bluish or purple tint to your lips means your blood may not be carrying enough oxygen. This is a medical emergency — call 911 or go to the ER immediately.',
  },
  'petechiae': {
    zones: ['leftCheek', 'rightCheek'], label: 'Petechiae / Purpura', redFlag: true, pad: 0.03,
    laymanLabel: 'Tiny red or purple spots on skin',
    laymanDesc: 'Pinpoint red or purple dots that do not fade when you press on them signal a bleeding or clotting disorder. After delivery this can indicate HELLP syndrome or DIC — both medical emergencies.',
  },
  // ── Vascular & Inflammatory ──────────────────────────────────────────────
  'facial flushing': {
    zones: ['leftCheek', 'rightCheek'], label: 'Facial Flushing', redFlag: false, pad: 0.03,
    laymanLabel: 'Red or flushed cheeks',
    laymanDesc: 'A flushed or reddened face can be a sign of elevated blood pressure, fever, or your body fighting an infection — all of which need attention in the weeks after delivery.',
  },
  'facial erythema': {
    zones: ['fullFace'], label: 'Diffuse Facial Erythema', redFlag: true, pad: 0.02,
    laymanLabel: 'Widespread redness across face',
    laymanDesc: 'Redness spread across the whole face alongside fever or feeling very unwell can be an early warning sign of sepsis — a life-threatening response to infection that requires immediate emergency care.',
  },
  'malar rash': {
    zones: ['leftCheek', 'rightCheek'], label: 'Malar Rash (Butterfly Distribution)', redFlag: false, pad: 0.04,
    laymanLabel: 'Butterfly rash across cheeks',
    laymanDesc: 'A rash shaped like butterfly wings across your cheeks and nose can be a sign of a lupus flare. Pregnancy and delivery are known triggers for lupus flares, and postpartum lupus should be evaluated.',
  },
  'diaphoresis': {
    zones: ['forehead'], label: 'Diaphoresis', redFlag: false, pad: 0.07,
    laymanLabel: 'Excessive sweating on forehead',
    laymanDesc: 'Unusual or excessive sweating when you are not hot or active can be a sign of hormonal changes, infection, or your body under physiological stress — all worth discussing with your provider.',
  },
  // ── Neurological Signs ───────────────────────────────────────────────────
  'facial asymmetry': {
    zones: ['fullFace'], label: 'Facial Asymmetry / Facial Nerve Palsy', redFlag: true, pad: 0.02,
    laymanLabel: 'One side of face drooping or uneven',
    laymanDesc: 'If one side of your face looks different, droops, or does not move the same as the other side, this could be a sign of a stroke or Bell\'s palsy. Sudden facial asymmetry is a 911 emergency — do not wait.',
  },
  'ptosis': {
    zones: ['leftEye', 'rightEye'], label: 'Ptosis (Eyelid Droop)', redFlag: true, pad: 0.07,
    laymanLabel: 'Drooping eyelid',
    laymanDesc: 'A new drooping of one upper eyelid can signal a problem with the nerves controlling your eye — which can be related to a stroke, aneurysm, or nerve compression. This needs same-day evaluation.',
  },
  'visual disturbances': {
    zones: ['leftEye', 'rightEye'], label: 'Visual Disturbances / Photopsia', redFlag: true, pad: 0.06,
    laymanLabel: 'Spots, flashing lights, or blurry vision',
    laymanDesc: 'Seeing spots, flashing lights, or sudden blurry vision after delivery is one of the most serious warning signs of preeclampsia affecting your brain and eyes. Go to the ER or call 911 now.',
  },
  'facial paresthesia': {
    zones: ['fullFace'], label: 'Facial Paresthesia / Hypoesthesia', redFlag: true, pad: 0.02,
    laymanLabel: 'Numbness or tingling in face',
    laymanDesc: 'Numbness, tingling, or a "pins and needles" feeling in your face that appeared suddenly is a potential warning sign of a neurological event, including stroke, and needs emergency evaluation.',
  },
  // ── Pain & Pressure ──────────────────────────────────────────────────────
  'severe cephalgia': {
    zones: ['forehead'], label: 'Severe Cephalgia / Hypertensive Headache', redFlag: true, pad: 0.07,
    laymanLabel: 'Severe or "worst ever" headache',
    laymanDesc: 'A severe headache — especially one that feels like the worst of your life or is different from your usual headaches — is the #1 warning sign of a hypertensive crisis or preeclampsia after delivery.',
  },
  'nasal flaring': {
    zones: ['nose'], label: 'Nasal Flaring / Respiratory Distress Sign', redFlag: true, pad: 0.05,
    laymanLabel: 'Nostrils flaring when breathing',
    laymanDesc: 'Your nostrils widening with each breath is your body\'s effort to pull in more air. This is a visible sign of respiratory distress and can indicate a pulmonary embolism (blood clot in the lung) — a postpartum emergency.',
  },
  // ── Periorbital ──────────────────────────────────────────────────────────
  'periorbital darkening': {
    zones: ['leftEye', 'rightEye'], label: 'Periorbital Hyperpigmentation / Infraorbital Darkening', redFlag: false, pad: 0.07,
    laymanLabel: 'Dark circles under eyes',
    laymanDesc: 'Very pronounced dark circles or a sunken look under the eyes can indicate severe anemia, iron deficiency, or significant cumulative blood loss — all common in the postpartum period and worth checking.',
  },
}

interface Props {
  imageSrc: string
  symptoms: string[]
  compact?: boolean
  view?: 'patient' | 'doctor'
}
type Lm = { x: number; y: number; z: number }
type Status = 'loading' | 'done' | 'no-face' | 'error'

function getBBox(lms: Lm[], indices: number[], W: number, H: number, pad: number) {
  const pts = indices.map(i => lms[i]).filter(Boolean)
  if (!pts.length) return null
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const x0 = Math.max(0, Math.min(...xs) - pad) * W
  const y0 = Math.max(0, Math.min(...ys) - pad) * H
  const x1 = Math.min(1, Math.max(...xs) + pad) * W
  const y1 = Math.min(1, Math.max(...ys) + pad) * H
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 10) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, boxTop: number, color: string, W: number) {
  const fs = Math.round(Math.max(12, W * 0.022))
  ctx.font = `700 ${fs}px system-ui, -apple-system, sans-serif`
  const pad = fs * 0.55
  const tw = ctx.measureText(text).width
  const bw = tw + pad * 2, bh = fs + pad * 1.2
  const bx = Math.max(2, Math.min(cx - bw / 2, W - bw - 2))
  const by = Math.max(2, boxTop - bh - 8)
  ctx.fillStyle = color
  rrect(ctx, bx, by, bw, bh, 6)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, bx + pad, by + bh / 2)
  const lw = Math.max(1.5, W * 0.002)
  ctx.strokeStyle = color; ctx.lineWidth = lw
  ctx.setLineDash([lw * 3, lw * 2])
  ctx.beginPath(); ctx.moveTo(cx, by + bh); ctx.lineTo(cx, boxTop); ctx.stroke()
  ctx.setLineDash([])
}

function drawMesh(ctx: CanvasRenderingContext2D, lms: Lm[], W: number, H: number) {
  const connections = [
    [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],
    [454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],
    [400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],
    [172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10],
    [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],[133,173],[173,157],[157,158],[158,159],[159,160],[160,161],[161,246],[246,33],
    [362,382],[382,381],[381,380],[380,374],[374,373],[373,390],[390,249],[249,263],[263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362],
    [61,185],[185,40],[40,39],[39,37],[37,0],[0,267],[267,269],[269,270],[270,409],[409,291],[291,375],[375,321],[321,405],[405,314],[314,17],[17,84],[84,181],[181,91],[91,146],[146,61],
    [6,197],[197,195],[195,5],[5,4],[4,1],[1,19],
  ]
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.55)'
  ctx.lineWidth = Math.max(0.8, W * 0.001)
  connections.forEach(([a, b]) => {
    if (!lms[a] || !lms[b]) return
    ctx.beginPath()
    ctx.moveTo(lms[a].x * W, lms[a].y * H)
    ctx.lineTo(lms[b].x * W, lms[b].y * H)
    ctx.stroke()
  })
  const keyPoints = [33, 263, 1, 61, 291, 199, 10, 152, 234, 454]
  ctx.fillStyle = 'rgba(100, 220, 255, 0.9)'
  keyPoints.forEach(i => {
    if (!lms[i]) return
    ctx.beginPath()
    ctx.arc(lms[i].x * W, lms[i].y * H, Math.max(2, W * 0.004), 0, Math.PI * 2)
    ctx.fill()
  })
}

export function FaceAnnotation({ imageSrc, symptoms, view }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!imageSrc) return
    let cancelled = false

    const run = async () => {
      setStatus('loading')
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const el = new Image()
          el.onload = () => res(el)
          el.onerror = rej
          el.src = imageSrc
        })
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const natW = img.naturalWidth || img.width
        const natH = img.naturalHeight || img.height
        if (!natW || !natH) { setStatus('error'); return }

        // Scale to ≤640px — large webcam images (1080p+) cause MediaPipe WASM failures
        const MAX = 640
        const scale = Math.min(1, MAX / Math.max(natW, natH))
        const W = Math.round(natW * scale)
        const H = Math.round(natH * scale)
        canvas.width = W
        canvas.height = H
        ctx.drawImage(img, 0, 0, W, H)

        const landmarker = await getLandmarker()
        if (cancelled) return

        let result
        try {
          result = landmarker.detect(canvas)
        } catch (detectErr) {
          console.error('[FaceAnnotation] detect() threw:', detectErr)
          _landmarkerPromise = null
          if (!cancelled) setStatus('error')
          return
        }

        const lms = result.faceLandmarks?.[0]
        if (!lms?.length) { setStatus('no-face'); return }

        ctx.drawImage(img, 0, 0, W, H)
        drawMesh(ctx, lms, W, H)

        const labeled = new Set<string>()
        symptoms.forEach(sym => {
          const mapping = SYMPTOM_MAP[sym.toLowerCase().trim()]
          if (!mapping) return
          const color   = mapping.redFlag ? '#dc2626' : '#d97706'
          const colorBg = mapping.redFlag ? 'rgba(220,38,38,0.14)' : 'rgba(217,119,6,0.14)'
          const lw = Math.max(2, W * 0.003)

          mapping.zones.forEach(zone => {
            const bbox = getBBox(lms, LMKS[zone] ?? [], W, H, mapping.pad)
            if (!bbox) return
            const { x, y, w, h } = bbox
            ctx.fillStyle = colorBg; rrect(ctx, x, y, w, h); ctx.fill()
            ctx.strokeStyle = color; ctx.lineWidth = lw
            ctx.setLineDash([lw * 3, lw * 2]); rrect(ctx, x, y, w, h); ctx.stroke()
            ctx.setLineDash([])
            const lk = `${zone}:${sym}`
            if (!labeled.has(lk)) {
              labeled.add(lk)
              // Canvas label always uses clinical term
              drawLabel(ctx, mapping.label, x + w / 2, y, color, W)
            }
          })
        })

        setStatus('done')
      } catch (err) {
        console.error('[FaceAnnotation] error:', err)
        if (!cancelled) setStatus('error')
      }
    }

    run()
    return () => { cancelled = true }
  }, [imageSrc, symptoms])

  const active = symptoms.filter(s => SYMPTOM_MAP[s.toLowerCase().trim()])

  return (
    <div style={{ position: 'relative' }}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10, borderRadius: 8,
          background: 'rgba(0,0,0,0.52)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#a78bfa', borderRadius: '50%',
            animation: 'spin 0.9s linear infinite',
          }} />
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>MediaPipe analyzing…</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>Detecting 478 facial landmarks</div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{ width: '100%', borderRadius: 8, display: 'block', minHeight: status === 'loading' ? 200 : undefined }}
      />

      {status === 'no-face' && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No face detected — ensure face is visible and well-lit.
        </div>
      )}
      {status === 'error' && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--risk-moderate)', fontStyle: 'italic' }}>
          Face analysis unavailable (check network connection).
        </div>
      )}
      {status === 'done' && symptoms.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--risk-low)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--risk-low)', flexShrink: 0 }} />
          Face scan complete. Clinical markers will be highlighted in your report after analysis.
        </div>
      )}

      {/* ── Patient view: layman description cards ─────────────────── */}
      {active.length > 0 && status === 'done' && view === 'patient' && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map(s => {
            const m = SYMPTOM_MAP[s.toLowerCase()]
            if (!m) return null
            const isRed = m.redFlag
            return (
              <div key={s} style={{
                borderRadius: 10,
                border: `1.5px solid ${isRed ? 'var(--risk-high-border)' : 'var(--risk-moderate-border)'}`,
                background: isRed ? 'var(--risk-high-bg)' : 'var(--risk-moderate-bg)',
                padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                    background: isRed ? 'var(--risk-high)' : 'var(--risk-moderate)',
                    color: '#fff',
                  }}>
                    {isRed ? '!! ' : ''}{m.laymanLabel}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                  {m.laymanDesc}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Doctor view / default: clinical term chips ─────────────── */}
      {active.length > 0 && status === 'done' && view !== 'patient' && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {active.map(s => {
            const m = SYMPTOM_MAP[s.toLowerCase()]
            if (!m) return null
            return (
              <span key={s} style={{
                fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                background: m.redFlag ? 'var(--risk-high-bg)' : 'var(--risk-moderate-bg)',
                color: m.redFlag ? 'var(--risk-high)' : 'var(--risk-moderate)',
                border: `1px solid ${m.redFlag ? 'var(--risk-high-border)' : 'var(--risk-moderate-border)'}`,
              }}>
                {m.redFlag ? '[!!] ' : ''}{m.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
