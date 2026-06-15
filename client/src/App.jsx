import { useEffect, useState, useRef } from "react";
import { initSpotify, pollCurrentlyPlaying, getInterpolatedPosition } from './spotify';
import { fetchSyncedLyrics, getActiveLine } from './lyrics';
import { fetchAnnotations } from './annotations';
import { mergeLyricsAndAnnotations } from './merge';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [lines, setLines] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const linesRef = useRef([]);
    linesRef.current = lines;
    
    useEffect(() => {
      let pollInterval, tickInterval;
      // If the component unmounts mid-await, bail before creating the
      // intervals — otherwise they'd be set up AFTER cleanup ran and leak
      let cancelled = false;

      async function start() {
        const authenticated = await initSpotify();
        if (cancelled) return;

        if (!authenticated) {
          setIsAuthenticated(false);
          return;
        }

        setIsAuthenticated(true);

        // ── TRACK CHANGE HANDLER ─────────────────────────────────────────────
        // This function runs every time Spotify reports a new track
        // It fetches lyrics and annotations in parallel then merges them
        async function onTrackChange(track) {
          console.log('Track changed:', track.title, '-', track.artist);
          setCurrentTrack(track);
          setLines([]);

          const [lyrics, annotations] = await Promise.all([
            fetchSyncedLyrics(track),
            fetchAnnotations(track)
          ]);

          console.log('Lyrics lines:', lyrics.length);
          console.log('Annotations:', annotations.length);

          const merged = mergeLyricsAndAnnotations(lyrics, annotations);
          console.log('Merged lines with annotations:', merged.filter(l => l.annotation).length);

          setLines(merged);
        }

        // ── POLLING LOOP ─────────────────────────────────────────────────────
        // Poll Spotify every 3 seconds to detect track changes
        // Run once immediately so we don't wait 3 seconds on load
        await pollCurrentlyPlaying(onTrackChange);
        if (cancelled) return;

        pollInterval = setInterval(() => {
          pollCurrentlyPlaying(onTrackChange);
        }, 3000);

        // ── UI TICK ──────────────────────────────────────────────────────────
        // Every 100ms, calculate the current playback position
        // and update which lyric line should be highlighted
        // This runs much faster than the Spotify poll because it's
        // purely local calculation — no API calls involved
        tickInterval = setInterval(() => {
          const position = getInterpolatedPosition();
          const index = getActiveLine(linesRef.current, position);
          setActiveIndex(index);
        }, 100);
      }

      start();

      return () => {
        cancelled = true;
        clearInterval(pollInterval);
        clearInterval(tickInterval);
      };
    }, [])
  
  // ── RENDER ───────────────────────────────────────────────────────────────
  // For now just log to console — UI comes in Phase 7
  // We render minimal output so we can visually confirm data is flowing

  if (!isAuthenticated) {
    return (
      <div>
        <a href={`${SERVER_URL}/auth/login`}>Login with Spotify</a>
      </div>
    );
  }

  return (
    <div>
      <h1>Lyric Replay</h1>
      {currentTrack && (
        <p>{currentTrack.title} - {currentTrack.artist}</p>
      )}
      <p>Active line: {activeIndex}</p>
      <p>Lines loaded: {lines.length}</p>
      <p>Annotated lines: {lines.filter(l => l.annotation).length}</p>
    </div>
  )
}


