import { useEffect, useState, useRef } from 'react'
import { initSpotify, pollCurrentlyPlaying, getInterpolatedPosition } from './spotify'
import { fetchSyncedLyrics, getActiveLine } from './lyrics'
import { fetchAnnotations } from './annotations'
import { mergeLyricsAndAnnotations } from './merge'

// ── SUBCOMPONENTS ─────────────────────────────────────────────────────────────
// Same components as before — no changes needed here
// They just receive props and render — they don't care where the data comes from

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

function LyricsPanel({ lines, activeIndex, onLineClick }) {
  // We use a ref here to scroll the active line into view automatically
  // as the song progresses — the user never has to manually scroll
  const activeRef = useRef(null)

  useEffect(() => {
    // Whenever the active line changes, scroll it into the center of the viewport
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [activeIndex])

  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600">Loading lyrics...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-12 space-y-3">
      {lines.map((line, i) => (
        <p
          // Attach the ref to whichever line is currently active
          ref={i === activeIndex ? activeRef : null}
          key={i}
          onClick={() => line.annotation && onLineClick(line.annotation)}
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

function AnnotationPanel({ annotation }) {
  if (!annotation) {
    return (
      <div className="w-80 border-l border-zinc-800 px-6 py-12 flex items-center justify-center">
        <p className="text-zinc-600 text-sm text-center">
          Click an underlined lyric to see its annotation
        </p>
      </div>
    )
  }
  return (
    <div className="w-80 border-l border-zinc-800 px-6 py-12">
      <p className="text-zinc-400 text-xs uppercase tracking-widest mb-4">Genius Annotation</p>
      <p className="text-zinc-200 text-sm leading-relaxed">{annotation}</p>
    </div>
  )
}

// ── LOGIN SCREEN ──────────────────────────────────────────────────────────────
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

// ── IDLE SCREEN ───────────────────────────────────────────────────────────────
// Shown when authenticated but nothing is playing
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
  const linesRef = useRef([])

  // Keep the ref in sync with lines state
  // This solves the stale closure problem in setInterval
  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  useEffect(() => {
    async function start() {
      const authenticated = await initSpotify()
      if (!authenticated) {
        setIsAuthenticated(false)
        return
      }
      setIsAuthenticated(true)

      async function onTrackChange(track) {
        setCurrentTrack(track)
        setLines([])
        // Clear annotation panel when track changes
        setActiveAnnotation(null)

        const [lyrics, annotations] = await Promise.all([
          fetchSyncedLyrics(track),
          fetchAnnotations(track)
        ])

        const merged = mergeLyricsAndAnnotations(lyrics, annotations)
        setLines(merged)
      }

      await pollCurrentlyPlaying(onTrackChange)
      const pollInterval = setInterval(() => {
        pollCurrentlyPlaying(onTrackChange)
      }, 3000)

      const tickInterval = setInterval(() => {
        const position = getInterpolatedPosition()
        const index = getActiveLine(linesRef.current, position)
        setActiveIndex(index)
      }, 100)

      return () => {
        clearInterval(pollInterval)
        clearInterval(tickInterval)
      }
    }

    start()
  }, [])

  if (!isAuthenticated) return <LoginScreen />
  if (!currentTrack) return <IdleScreen />

  return (
    <div className="bg-zinc-950 min-h-screen text-white flex flex-col">
      <div className="flex flex-1 overflow-hidden pb-24">
        <LyricsPanel
          lines={lines}
          activeIndex={activeIndex}
          onLineClick={setActiveAnnotation}
        />
        <AnnotationPanel annotation={activeAnnotation} />
      </div>
      <NowPlayingBar track={currentTrack} />
    </div>
  )
}

export default App