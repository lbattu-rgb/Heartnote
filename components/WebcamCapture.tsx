import { useRef, useState, useCallback, useEffect } from 'react'

interface WebcamCaptureProps {
  onCapture: (base64: string) => void
}

type Phase = 'idle' | 'prepare' | 'streaming' | 'captured' | 'error'

const PREP_TIPS = [
  { icon: '💡', title: 'Good lighting',     detail: 'Face a window or bright lamp — avoid backlighting' },
  { icon: '👓', title: 'Remove glasses',    detail: 'Take off glasses, sunglasses, or anything on your face' },
  { icon: '🧢', title: 'Clear your face',   detail: 'Remove hats, hoods, or hair covering your forehead' },
  { icon: '📐', title: 'Eye level',          detail: 'Hold the camera at eye level, not below your chin' },
  { icon: '😐', title: 'Neutral expression', detail: 'Relax your face and look directly at the camera' },
]

export function WebcamCapture({ onCapture }: WebcamCaptureProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase]     = useState<Phase>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  // Attach stream after phase change so the video element is in the DOM
  useEffect(() => {
    if (phase === 'streaming' && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play()
    }
  }, [phase])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      setPhase('streaming')
      setErrorMsg('')
    } catch {
      setErrorMsg('Camera access was denied. You can skip this step.')
      setPhase('error')
    }
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const capture = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    setPreview(base64)
    onCapture(base64)
    stopStream()
    setPhase('captured')
  }, [onCapture])

  const retake = () => {
    setPreview(null)
    setChecked(new Set())
    setPhase('idle')
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setPreview(base64)
      onCapture(base64)
      setPhase('captured')
    }
    reader.readAsDataURL(file)
    // reset so the same file can be re-selected if the user retakes
    e.target.value = ''
  }

  const toggleTip = (i: number) => {
    const next = new Set(checked)
    next.has(i) ? next.delete(i) : next.add(i)
    setChecked(next)
  }

  const allChecked = checked.size === PREP_TIPS.length

  return (
    <div className="card animate-in" style={{ maxWidth: 440 }}>
      <h3 style={{ marginBottom: 16, fontSize: 18 }}>Face Photo</h3>

      {/* ── Idle ─────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>📷</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
            A quick photo helps identify visible symptoms like facial swelling or pallor.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setPhase('prepare')}>
              Take Photo
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Photo
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
        </div>
      )}

      {/* ── Prepare checklist ────────────────────────────── */}
      {phase === 'prepare' && (
        <div className="animate-in">
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            Check each box once you're ready — this helps us see symptoms clearly.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {PREP_TIPS.map((tip, i) => {
              const isChecked = checked.has(i)
              return (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${isChecked ? 'var(--risk-low-border)' : 'var(--border)'}`,
                    background: isChecked ? 'var(--risk-low-bg)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleTip(i)}
                    style={{ width: 16, height: 16, accentColor: 'var(--risk-low)', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{tip.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tip.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tip.detail}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={startCamera}
              disabled={!allChecked}
              style={{ opacity: allChecked ? 1 : 0.45, cursor: allChecked ? 'pointer' : 'not-allowed' }}
            >
              I'm Ready — Open Camera
            </button>
            <button
              className="btn btn-secondary"
              onClick={startCamera}
              style={{ fontSize: 12 }}
            >
              Skip checklist
            </button>
          </div>

          {!allChecked && (
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              {PREP_TIPS.length - checked.size} item{PREP_TIPS.length - checked.size !== 1 ? 's' : ''} left
            </p>
          )}
        </div>
      )}

      {/* ── Streaming ─────────────────────────────────────── */}
      {phase === 'streaming' && (
        <div style={{ textAlign: 'center' }} className="animate-in">
          <video
            ref={videoRef}
            style={{ width: '100%', borderRadius: 8, marginBottom: 12 }}
            playsInline
            muted
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <button className="btn btn-capture" onClick={capture}>
            📸 Capture
          </button>
        </div>
      )}

      {/* ── Captured ──────────────────────────────────────── */}
      {phase === 'captured' && preview && (
        <div style={{ textAlign: 'center' }} className="animate-in">
          <img
            src={preview}
            alt="Captured face"
            style={{ width: '100%', borderRadius: 8, marginBottom: 12 }}
          />
          <button className="btn btn-secondary" onClick={retake}>
            Retake
          </button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────── */}
      {phase === 'error' && (
        <div style={{ textAlign: 'center' }} className="animate-in">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🚫</div>
          <p style={{ color: 'var(--risk-high)', marginBottom: 16, fontSize: 14 }}>
            {errorMsg}
          </p>
          <button className="btn btn-secondary" onClick={() => setPhase('idle')}>
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
