// This is temporary test code — we're hardcoding a known track
// to verify LRC Lib returns data before wiring up real Spotify data
import { useEffect, useState } from 'react'
import { fetchSyncedLyrics, getActiveLine } from './lyrics'

function App() {
  const [lines, setLines] = useState([])

  useEffect(() => {
    // Hardcode a well-known track to test with
    // Skinny Love by Bon Iver is a good test case — it's in LRC Lib
    const testTrack = {
      title: 'Never Be the Same',
      artist: 'Camila Cabello',
      album: 'Camila',
      duration: 227000
    }

    fetchSyncedLyrics(testTrack).then(result => {
      console.log('Lines returned:', result.length)
      console.log('First line:', result[0])
      console.log('Active line at 30s:', getActiveLine(result, 30000))
      setLines(result)
    })

  }, [])

  return (
    <div>
      <h1>Lyric Replay</h1>
      {/* Render the lines so you can visually verify they look right */}
      {lines.map((line, i) => (
        <p key={i}>{line.text}</p>
      ))}
    </div>
  )
}

export default App