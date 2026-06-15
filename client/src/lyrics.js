// ─── FETCH SYNCED LYRICS ─────────────────────────────────────────────────────
// LRC Lib is a free open database of timestamped lyrics in .lrc format
// .lrc is a simple format that looks like this:
// [00:12.34] Hello, is it me you're looking for
// [00:15.00] I can see it in your eyes
// Each line has a timestamp and the lyric text
// We fetch from LRC Lib and parse that format into usable objects

export async function fetchSyncedLyrics(track) {
    const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist,
        album_name: track.album,
        duration: Math.round(track.duration / 1000)
    });

    try {
        const response = await fetch(`https://lrclib.net/api/get?${params}`);

        if (!response.ok) return [];

        const data = await response.json();

        if (!data.syncedLyrics) return [];

        // Parse the raw .lrc string into an array of {time, text} objects
        return parseLRC(data.syncedLyrics);
    } catch (err) {
        console.error('LRC Lib fetch failed:', err);
        return [];
    }
}

// ─── PARSE LRC FORMAT ────────────────────────────────────────────────────────
// Takes a raw .lrc string and converts it into an array of objects
// Input:  "[00:12.34] Hello world\n[00:15.00] Another line"
// Output: [{ time: 12340, text: "Hello world" }, { time: 15000, text: "Another line" }]
function parseLRC(lrc) {
    return lrc
    .split('\n')
    .map(line => {
        // This regex matches the timestamp format [mm:ss.xx]
        // match[1] = minutes, match[2] = seconds.centiseconds, match[3] = lyric text
        const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        if (!match) return null;


        // Convert minutes and seconds into total milliseconds
        // This makes it easy to compare against Spotify's progress_ms later
        const minutes = parseInt(match[1]);
        const seconds = parseFloat(match[2]);
        const ms = (minutes * 60 + seconds) * 1000;

        return {
            time: ms,               // timestamp    
            text: match[3].trim(),  // lyric text
        };
    })
    .filter(line => line && line.text)
    .sort((a, b) => a.time - b.time);
}

// ─── GET ACTIVE LINE ─────────────────────────────────────────────────────────
// Given an array of lyric lines and the current playback position,
// returns the index of the line that should currently be highlighted
// 
// Logic: find the last line whose timestamp is <= current position
// e.g. if lines are at 0s, 5s, 10s and position is 7s → line at 5s is active
//
// findLastIndex works backwards through the array and returns the first match
// which is the most recent line that has already started
export function getActiveLine(lines, positionMs) {
    if (!lines.length) return 0;

    const index = lines.findLastIndex(line => line.time <= positionMs);

    return index === -1 ? 0 : index;
}