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
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-4 py-3 md:px-6 md:py-4 flex items-center gap-3 md:gap-4">
      <img src={track.albumArt} alt="Album art" className="w-10 h-10 md:w-14 md:h-14 rounded-md object-cover flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm truncate">{track.title}</p>
        <p className="text-zinc-400 text-sm truncate">{track.artist}</p>
      </div>
      <button
        onClick={onLogout}
        className="text-zinc-500 hover:text-white text-xs px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors flex-shrink-0"
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
      <div className="flex-1 overflow-hidden px-4 md:px-8 py-8 md:py-12 space-y-5">
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
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-8 md:py-12 space-y-3">
      {lines.map((line, i) => (
        <p
          ref={i === activeIndex ? activeRef : null}
          key={i}
          onClick={() => line.annotation && onLineClick(line.annotation, line.text)}
          className={`
            text-lg md:text-2xl font-semibold transition-all duration-300 leading-snug
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

  const annotationContent = (
    <>
      {!displayed ? (
        <p className="text-zinc-600 text-sm text-center">{placeholder}</p>
      ) : (
        <div
          className="transition-all duration-300"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
        >
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
    </>
  )

  return (
    <>
      {/* Mobile: slide-up bottom drawer, sits above the player bar (~64px tall) */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-16 bg-zinc-900 border-t border-zinc-800 max-h-48 overflow-y-auto transition-transform duration-300 ${visible && displayed ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="px-4 py-6">{annotationContent}</div>
      </div>

      {/* Desktop: fixed right sidebar */}
      <div className="hidden md:flex fixed right-0 top-0 bottom-24 w-80 border-l border-zinc-800 flex-col justify-center">
        <div className="px-6 py-8 overflow-y-auto">{annotationContent}</div>
      </div>
    </>
  )
}

// ── LOGIN / IDLE SCREENS ──────────────────────────────────────────────────────

function LoginScreen({ onDemo }) {
  const [query, setQuery] = useState('')
  const [warming, setWarming] = useState(false)

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) onDemo(query.trim())
  }

  async function handleSpotifyLogin() {
    setWarming(true)
    // Wake the backend — Render free tier spins down after inactivity
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) { window.location.href = `${SERVER_URL}/auth/login`; return }
      } catch { /* still starting */ }
      await new Promise(r => setTimeout(r, 2000))
    }
    // Timed out — send them anyway and let Render handle it
    window.location.href = `${SERVER_URL}/auth/login`
  }

  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-sm w-full">
        <div className="space-y-2">
          <h1 className="text-white text-3xl font-bold">Lyric Replay</h1>
          <p className="text-zinc-400 text-sm">See what your music really means</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for any song..."
            className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 rounded-full px-5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-600"
          />
          <button
            type="submit"
            className="bg-white text-black font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-zinc-200 transition-colors"
          >
            Go
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-zinc-600 text-xs">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <button
          onClick={handleSpotifyLogin}
          disabled={warming}
          className="w-full flex items-center justify-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-70 disabled:cursor-not-allowed text-black font-semibold px-6 py-3 rounded-full text-sm transition-colors"
        >
          {warming ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Starting up backend…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Log in with Spotify
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function IdleScreen({ onLogout }) {
  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-zinc-600">Play something on Spotify to get started</p>
        <button
          onClick={onLogout}
          className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  )
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3000'

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

        const [lyricsResult, annotationsResult] = await Promise.allSettled([
          fetchSyncedLyrics(track),
          fetchAnnotations(track)
        ])
        const lyrics = lyricsResult.status === 'fulfilled' ? lyricsResult.value : []
        const annotations = annotationsResult.status === 'fulfilled' ? annotationsResult.value : []

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
  if (!currentTrack) return <IdleScreen onLogout={handleLogout} />

  return (
    <div className="bg-zinc-950 min-h-screen text-white flex flex-col">
      <div className="flex flex-1 overflow-hidden pb-16 md:pb-24 md:pr-80">
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

function DemoScreen({ onBack, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [warmingDemo, setWarmingDemo] = useState(false)
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
  const [quotaExceeded, setQuotaExceeded] = useState(false)

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

  async function runSearch(q) {
    if (!q.trim()) return
    setResults(null)

    // Wake backend if it's cold
    setWarmingDemo(true)
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) break
      } catch { /* still starting */ }
      await new Promise(r => setTimeout(r, 2000))
    }
    setWarmingDemo(false)

    setSearching(true)
    try {
      const res = await fetch(`${SERVER_URL}/api/demo/search?q=${encodeURIComponent(q)}`)
      setResults(await res.json())
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  async function search(e) {
    e.preventDefault()
    runSearch(query)
  }

  useEffect(() => {
    if (initialQuery.trim()) runSearch(initialQuery.trim())
  }, [])

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
    setQuotaExceeded(false)
    setLyricsLoading(true)
    setNoLyrics(false)
    setNoAnnotations(false)

    const [lyricsResult, annotationsResult, ytResult] = await Promise.allSettled([
      fetchSyncedLyrics(t),
      fetchAnnotations(t),
      fetch(`${SERVER_URL}/api/demo/youtube?${new URLSearchParams({ title: t.title, artist: t.artist })}`).then(r => r.json()),
    ])
    const lyrics = lyricsResult.status === 'fulfilled' ? lyricsResult.value : []
    const annotations = annotationsResult.status === 'fulfilled' ? annotationsResult.value : []
    const ytRes = ytResult.status === 'fulfilled' ? ytResult.value : { videoId: null }

    const merged = mergeLyricsAndAnnotations(lyrics, annotations)
    setLyricsLoading(false)
    setNoLyrics(lyrics.length === 0)
    setNoAnnotations(annotations.length === 0)
    setLines(merged)

    if (ytRes.videoId) {
      initPlayer(ytRes.videoId)
    } else {
      setNoVideo(true)
      if (ytRes.error === 'quota_exceeded') setQuotaExceeded(true)
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

        {warmingDemo && <p className="text-zinc-500 text-sm">Starting up backend…</p>}
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
          ← Back home
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

      <div className="flex flex-1 overflow-hidden pb-16 md:pb-24 md:pr-80">
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
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-3 md:gap-4 mb-2 md:mb-3">
          {track.albumArt && <img src={track.albumArt} className="w-9 h-9 md:w-10 md:h-10 rounded object-cover flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{track.title}</p>
            <p className="text-zinc-400 text-xs truncate">{track.artist}</p>
          </div>
          {noVideo ? (
            <span className="text-zinc-600 text-xs hidden sm:inline">{quotaExceeded ? 'YouTube quota reached — try again tomorrow' : 'Audio unavailable'}</span>
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
  const [demoQuery, setDemoQuery] = useState('')

  function enterDemo(q = '') {
    setDemoQuery(q)
    setMode('demo')
  }

  return (
    <ErrorBoundary>
      {mode === 'demo'
        ? <DemoScreen onBack={() => setMode('login')} initialQuery={demoQuery} />
        : <App onDemo={enterDemo} />
      }
    </ErrorBoundary>
  )
}
