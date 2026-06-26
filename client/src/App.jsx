import { useEffect, useState, useRef, Component } from 'react'
import { initSpotify, pollCurrentlyPlaying, getInterpolatedPosition } from './spotify'
import { fetchSyncedLyrics, getActiveLine } from './lyrics'
import { fetchAnnotations } from './annotations'
import { mergeLyricsAndAnnotations } from './merge'

// ── ERROR BOUNDARY ────────────────────────────────────────────────────────────
// Catches any render-time or lifecycle errors thrown by child components.
// Without this, a single unhandled error unmounts the entire app and shows
// a blank screen. With it, the user sees a message and can recover.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-zinc-950 min-h-screen flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-white font-semibold">Something went wrong</p>
            <p className="text-zinc-500 text-sm">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-zinc-400 text-sm underline"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── SUBCOMPONENTS ─────────────────────────────────────────────────────────────

function NowPlayingBar({ track, onLogout }) {
  if (!track) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-6 py-4 flex items-center gap-4">
      <img src={track.albumArt} alt="Album art" className="w-14 h-14 rounded-md object-cover" />
      <div className="flex-1">
        <p className="text-white font-semibold text-sm">{track.title}</p>
        <p className="text-zinc-400 text-sm">{track.artist}</p>
      </div>
      <button
        onClick={onLogout}
        className="text-zinc-500 hover:text-white text-xs px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
      >
        Log out
      </button>
    </div>
  )
}

// Skeleton bar shown while lyrics are loading
function SkeletonLine({ width, bright }) {
  return (
    <div
      className={`h-7 rounded-md animate-pulse ${bright ? 'bg-zinc-700' : 'bg-zinc-800'}`}
      style={{ width }}
    />
  )
}

function LyricsPanel({ lines, activeIndex, onLineClick, loading, noLyrics }) {
  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex])

  if (loading) {
    // Pulse skeleton — varied widths feel more realistic than uniform bars
    const widths = ['75%', '60%', '80%', '55%', '70%', '65%', '78%', '50%']
    return (
      <div className="flex-1 overflow-hidden px-8 py-12 space-y-5">
        {widths.map((w, i) => (
          <SkeletonLine key={i} width={w} bright={i === 2} />
        ))}
      </div>
    )
  }

  if (noLyrics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600 text-sm">Synced lyrics unavailable for this track</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-12 space-y-3">
      {lines.map((line, i) => (
        <p
          ref={i === activeIndex ? activeRef : null}
          key={i}
          onClick={() => line.annotation && onLineClick(line.annotation, line.text)}
          className={`
            text-2xl font-semibold transition-all duration-300 leading-snug
            ${i === activeIndex
              ? 'text-white scale-105 origin-left'
              : i < activeIndex
              ? 'text-zinc-600'
              : 'text-zinc-500'
            }
            ${line.annotation ? 'cursor-pointer underline decoration-zinc-500 underline-offset-4' : ''}
          `}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}

function AnnotationPanel({ annotation, triggerLine, noAnnotations }) {
  const [visible, setVisible] = useState(false)
  const [displayed, setDisplayed] = useState(null)
  const [displayedLine, setDisplayedLine] = useState(null)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setDisplayed(annotation)
      setDisplayedLine(triggerLine)
      if (annotation) setVisible(true)
    }, 150)
    return () => clearTimeout(t)
  }, [annotation])

  // Update the quoted line instantly only when moving between lines that share
  // the same annotation — when the annotation itself changes, the main effect
  // above handles displayedLine inside the timeout after the fade-out
  useEffect(() => {
    if (annotation === displayed) setDisplayedLine(triggerLine)
  }, [triggerLine])

  let placeholder
  if (noAnnotations) {
    placeholder = 'No annotations available for this track'
  } else {
    placeholder = 'Annotations will appear here as the song plays, or click on an underlined lyric'
  }

  return (
    <div className="fixed right-0 top-0 bottom-24 w-80 border-l border-zinc-800 flex flex-col justify-center">
      <div className="px-6 py-8 overflow-y-auto">
        {!displayed ? (
          <p className="text-zinc-600 text-sm text-center">{placeholder}</p>
        ) : (
          <div
            className="transition-all duration-300"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
          >
            {/* Genius branding badge */}
            <div className="flex items-center gap-2 mb-4">
              <img src="https://genius.com/favicon.ico" width="16" height="16" className="rounded-sm" style={{ filter: 'brightness(0) saturate(100%) invert(97%) sepia(100%) saturate(2000%) hue-rotate(10deg)' }} />
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: '#FFFF64', fontFamily: "'Arial Black', 'Arial', sans-serif", letterSpacing: '0.15em' }}
              >
                Genius Annotation
              </span>
            </div>

            {displayedLine && (
              <p className="text-zinc-400 text-xs italic mb-3 leading-relaxed border-l-2 pl-3" style={{ borderColor: '#FFFF6480' }}>
                "{displayedLine}"
              </p>
            )}
            <p className="text-zinc-200 text-sm leading-relaxed">{displayed}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LOGIN / IDLE SCREENS ──────────────────────────────────────────────────────

function LoginScreen({ onDemo }) {
  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-white text-3xl font-bold">Lyric Replay</h1>
        <p className="text-zinc-400">See what your music really means</p>
        <a
          href="http://127.0.0.1:3000/auth/login"
          className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3 rounded-full transition-colors"
        >
          Login with Spotify
        </a>
        <div>
          <button
            onClick={onDemo}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Try demo (no login required) →
          </button>
        </div>
      </div>
    </div>
  )
}

function IdleScreen() {
  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center">
      <p className="text-zinc-600">Play something on Spotify to get started</p>
    </div>
  )
}

// ── MAIN APP COMPONENT ────────────────────────────────────────────────────────

function App({ onDemo }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [lines, setLines] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [annotationTriggerLine, setAnnotationTriggerLine] = useState(null)
  // null = not yet loaded, true = loading, false = done
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [noLyrics, setNoLyrics] = useState(false)
  const [noAnnotations, setNoAnnotations] = useState(false)
  const linesRef = useRef([])

  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  useEffect(() => {
    const line = lines[activeIndex]
    if (line?.annotation) {
      setActiveAnnotation(line.annotation)
      setAnnotationTriggerLine(line.text)
    }
  }, [activeIndex, lines])

  useEffect(() => {
    let pollInterval, tickInterval
    let cancelled = false

    async function start() {
      let authenticated = false
      try {
        authenticated = await initSpotify()
      } catch (err) {
        console.error('initSpotify failed:', err)
      }

      if (cancelled) return

      if (!authenticated) {
        setIsAuthenticated(false)
        return
      }
      setIsAuthenticated(true)

      async function onTrackChange(track) {
        setCurrentTrack(track)
        setLines([])
        setActiveIndex(0)
        setActiveAnnotation(null)
        setAnnotationTriggerLine(null)
        setNoLyrics(false)
        setNoAnnotations(false)
        setLyricsLoading(true)

        const [lyrics, annotations] = await Promise.all([
          fetchSyncedLyrics(track),
          fetchAnnotations(track)
        ])

        if (cancelled) return

        const merged = mergeLyricsAndAnnotations(lyrics, annotations)

        setLyricsLoading(false)
        setNoLyrics(lyrics.length === 0)
        setNoAnnotations(annotations.length === 0)
        setLines(merged)
      }

      try {
        await pollCurrentlyPlaying(onTrackChange)
      } catch (err) {
        console.error('Initial poll failed:', err)
      }

      if (cancelled) return

      pollInterval = setInterval(async () => {
        try {
          await pollCurrentlyPlaying(onTrackChange)
        } catch (err) {
          console.error('Poll failed:', err)
        }
      }, 3000)

      tickInterval = setInterval(() => {
        const position = getInterpolatedPosition()
        const index = getActiveLine(linesRef.current, position)
        setActiveIndex(index)
      }, 100)
    }

    start()

    return () => {
      cancelled = true
      clearInterval(pollInterval)
      clearInterval(tickInterval)
    }
  }, [])

  function handleLogout() {
    sessionStorage.removeItem('session')
    setIsAuthenticated(false)
    setCurrentTrack(null)
    setLines([])
  }

  if (!isAuthenticated) return <LoginScreen onDemo={onDemo} />
  if (!currentTrack) return <IdleScreen />

  return (
    <div className="bg-zinc-950 min-h-screen text-white flex flex-col">
      <div className="flex flex-1 overflow-hidden pb-24 pr-80">
        <LyricsPanel
          lines={lines}
          activeIndex={activeIndex}
          onLineClick={(annotation, text) => { setActiveAnnotation(annotation); setAnnotationTriggerLine(text) }}
          loading={lyricsLoading}
          noLyrics={noLyrics}
        />
        <AnnotationPanel
          annotation={activeAnnotation}
          triggerLine={annotationTriggerLine}
          noAnnotations={noAnnotations}
        />
      </div>
      <NowPlayingBar track={currentTrack} onLogout={handleLogout} />
    </div>
  )
}

// ── DEMO MODE ─────────────────────────────────────────────────────────────────

const DEMO_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3000'

function DemoScreen({ onBack }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [track, setTrack] = useState(null)
  const [lines, setLines] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [annotationTriggerLine, setAnnotationTriggerLine] = useState(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [noLyrics, setNoLyrics] = useState(false)
  const [noAnnotations, setNoAnnotations] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [noVideo, setNoVideo] = useState(false)

  const playerRef = useRef(null)       // YT.Player instance
  const tickRef = useRef(null)
  const linesRef = useRef([])

  useEffect(() => { linesRef.current = lines }, [lines])

  useEffect(() => {
    const line = lines[activeIndex]
    if (line?.annotation) {
      setActiveAnnotation(line.annotation)
      setAnnotationTriggerLine(line.text)
    }
  }, [activeIndex, lines])

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT) return
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  }, [])

  function initPlayer(videoId) {
    clearInterval(tickRef.current)
    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }

    const createPlayer = () => {
      const container = document.getElementById('yt-player')
      if (!container) return

      playerRef.current = new window.YT.Player('yt-player', {
        videoId,
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0 },
        events: {
          onReady(e) {
            e.target.playVideo()
            setDuration(e.target.getDuration() * 1000)
            tickRef.current = setInterval(() => {
              if (!playerRef.current) return
              const t = playerRef.current.getCurrentTime() * 1000
              setCurrentTime(t)
              setActiveIndex(getActiveLine(linesRef.current, t))
              const state = playerRef.current.getPlayerState()
              setPlaying(state === window.YT.PlayerState.PLAYING)
            }, 100)
          },
          onStateChange(e) {
            if (e.data === window.YT.PlayerState.ENDED) {
              setPlaying(false)
              clearInterval(tickRef.current)
            }
          },
          onError() {
            setNoVideo(true)
          },
        },
      })
    }

    if (window.YT?.Player) {
      createPlayer()
    } else {
      window.onYouTubeIframeAPIReady = createPlayer
    }
  }

  async function search(e) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setResults(null)
    try {
      const res = await fetch(`${DEMO_SERVER_URL}/api/demo/search?q=${encodeURIComponent(query)}`)
      setResults(await res.json())
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  async function selectTrack(t) {
    clearInterval(tickRef.current)
    setTrack(t)
    setResults(null)
    setLines([])
    setActiveIndex(0)
    setActiveAnnotation(null)
    setAnnotationTriggerLine(null)
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setNoVideo(false)
    setLyricsLoading(true)
    setNoLyrics(false)
    setNoAnnotations(false)

    const [lyrics, annotations, ytRes] = await Promise.all([
      fetchSyncedLyrics(t),
      fetchAnnotations(t),
      fetch(`${DEMO_SERVER_URL}/api/demo/youtube?${new URLSearchParams({ title: t.title, artist: t.artist })}`).then(r => r.json()).catch(() => ({ videoId: null })),
    ])

    const merged = mergeLyricsAndAnnotations(lyrics, annotations)
    setLyricsLoading(false)
    setNoLyrics(lyrics.length === 0)
    setNoAnnotations(annotations.length === 0)
    setLines(merged)

    if (ytRes.videoId) {
      initPlayer(ytRes.videoId)
    } else {
      setNoVideo(true)
    }
  }

  function togglePlay() {
    if (!playerRef.current) return
    const state = playerRef.current.getPlayerState()
    if (state === window.YT.PlayerState.PLAYING) {
      playerRef.current.pauseVideo()
      setPlaying(false)
    } else {
      playerRef.current.playVideo()
      setPlaying(true)
    }
  }

  useEffect(() => () => clearInterval(tickRef.current), [])

  // Search view
  if (!track) {
    return (
      <div className="bg-zinc-950 min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center">
          <h1 className="text-white text-3xl font-bold mb-1">Lyric Replay</h1>
          <p className="text-zinc-400 text-sm">Demo — full songs, no login needed</p>
        </div>
        <form onSubmit={search} className="flex gap-2 w-full max-w-md">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search a song..."
            className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 rounded-full px-5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-600"
          />
          <button
            type="submit"
            className="bg-white text-black font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-zinc-200 transition-colors"
          >
            Search
          </button>
        </form>

        {searching && <p className="text-zinc-500 text-sm">Searching…</p>}
        {results && results.length === 0 && <p className="text-zinc-500 text-sm">No results found</p>}

        {results && results.length > 0 && (
          <div className="w-full max-w-md space-y-2">
            {results.map((t, i) => (
              <button
                key={i}
                onClick={() => selectTrack(t)}
                className="w-full flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl px-4 py-3 transition-colors text-left"
              >
                {t.albumArt && <img src={t.albumArt} className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.title}</p>
                  <p className="text-zinc-400 text-xs truncate">{t.artist}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <button onClick={onBack} className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors">
          ← Back to login
        </button>
      </div>
    )
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  // Player view
  return (
    <div className="bg-zinc-950 min-h-screen text-white flex flex-col">
      {/* Hidden YouTube player — audio only visually, full player needed for API */}
      <div style={{ position: 'fixed', bottom: 96, right: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div id="yt-player" />
      </div>

      <div className="flex flex-1 overflow-hidden pb-24 pr-80">
        <LyricsPanel
          lines={lines}
          activeIndex={activeIndex}
          onLineClick={(annotation, text) => { setActiveAnnotation(annotation); setAnnotationTriggerLine(text) }}
          loading={lyricsLoading}
          noLyrics={noLyrics}
        />
        <AnnotationPanel
          annotation={activeAnnotation}
          triggerLine={annotationTriggerLine}
          noAnnotations={noAnnotations}
        />
      </div>

      {/* Demo bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4 mb-3">
          {track.albumArt && <img src={track.albumArt} className="w-10 h-10 rounded object-cover flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{track.title}</p>
            <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
          </div>
          {noVideo ? (
            <span className="text-zinc-600 text-xs">Audio unavailable</span>
          ) : (
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 hover:bg-zinc-200 transition-colors"
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="2" y="1" width="4" height="12" rx="1"/>
                  <rect x="8" y="1" width="4" height="12" rx="1"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3 1.5l9 5.5-9 5.5z"/>
                </svg>
              )}
            </button>
          )}
          <button onClick={() => { clearInterval(tickRef.current); playerRef.current?.destroy(); playerRef.current = null; setTrack(null); setResults(null) }} className="text-zinc-500 hover:text-white text-xs px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors">
            Search
          </button>
          <button onClick={onBack} className="text-zinc-500 hover:text-white text-xs px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors">
            Log in
          </button>
        </div>
        {!noVideo && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-zinc-500 flex-shrink-0">
              <path d="M2 5h2l3-3v10L4 9H2V5zm7 .5a3 3 0 010 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
            </svg>
            <input
              type="range" min="0" max="100" defaultValue="100"
              onChange={e => playerRef.current?.setVolume(Number(e.target.value))}
              className="w-20 accent-zinc-400"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Wrap in ErrorBoundary at the export so any crash anywhere in the tree
// shows the fallback UI instead of a blank screen
export default function Root() {
  const [mode, setMode] = useState('login')
  return (
    <ErrorBoundary>
      {mode === 'demo'
        ? <DemoScreen onBack={() => setMode('login')} />
        : <App onDemo={() => setMode('demo')} />
      }
    </ErrorBoundary>
  )
}
