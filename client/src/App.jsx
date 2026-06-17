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

function NowPlayingBar({ track }) {
  if (!track) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-6 py-4 flex items-center gap-4">
      <img src={track.albumArt} alt="Album art" className="w-14 h-14 rounded-md object-cover" />
      <div>
        <p className="text-white font-semibold text-sm">{track.title}</p>
        <p className="text-zinc-400 text-sm">{track.artist}</p>
      </div>
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

  let placeholder
  if (noAnnotations) {
    placeholder = 'No annotations available for this track'
  } else {
    placeholder = 'Annotations will appear here as the song plays'
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
            {displayedLine && (
              <p className="text-zinc-500 text-xs italic mb-3 leading-relaxed border-l-2 border-zinc-700 pl-3">
                "{displayedLine}"
              </p>
            )}
            <p className="text-zinc-400 text-xs uppercase tracking-widest mb-3">Genius Annotation</p>
            <p className="text-zinc-200 text-sm leading-relaxed">{displayed}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LOGIN / IDLE SCREENS ──────────────────────────────────────────────────────

function LoginScreen() {
  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-white text-3xl font-bold">Lyric Replay</h1>
        <p className="text-zinc-400">See what your music really means</p>
        <a
          href="http://localhost:3000/auth/login"
          className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3 rounded-full transition-colors"
        >
          Login with Spotify
        </a>
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

function App() {
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

  if (!isAuthenticated) return <LoginScreen />
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
      <NowPlayingBar track={currentTrack} />
    </div>
  )
}

// Wrap in ErrorBoundary at the export so any crash anywhere in the tree
// shows the fallback UI instead of a blank screen
export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
