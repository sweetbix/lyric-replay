import * as cheerio from 'cheerio';

const GENIUS_TOKEN = process.env.GENIUS_TOKEN;

const headers = { Authorization: `Bearer ${GENIUS_TOKEN}` };


// ─── SEARCH FOR A SONG ───────────────────────────────────────────────────────
// Takes a track title and artist and returns the first matching Genius song object
// The song object contains the song's Genius ID and its lyrics page URL
// both of which we need for subsequent calls
export async function searchSong(title, artist) {
    // Spotify titles often include collaborator tags like "(with Alesso & watt)"
    // or "(feat. X)" that don't appear in Genius titles — strip them before searching
    const cleanTitle = title
        .replace(/\s*\(with [^)]+\)/gi, '')
        .replace(/\s*\(feat\.?[^)]+\)/gi, '')
        .replace(/\s*\(ft\.?[^)]+\)/gi, '')
        .trim();

    const query = encodeURIComponent(`${cleanTitle} ${artist}`);

    const response = await fetch(
        `https://api.genius.com/search?q=${query}`,
        { headers }
    );


    const data = await response.json();
    const hits = data.response.hits;

    if (!hits || hits.length === 0) return null;

    return hits[0].result;
}


// ─── FETCH REFERENTS (ANNOTATIONS) ───────────────────────────────────────────
// Referents are Genius's term for annotatable lyric fragments
// Each referent is a highlighted chunk of lyrics that has at least one annotation
// This call returns all of them for a given song
export async function getReferents(songId) {
    const response = await fetch(
        `https://api.genius.com/referents?song_id=${songId}&text_format=plain&per_page=50`,
        { headers }
    );

    const data = await response.json();
    const referents = data.response.referents;

    return referents
        .map(ref => ({ 
            fragment: ref.fragment,
            // annotations is an array because multiple people can annotate the same fragment
            // annotations[0] is the top/most upvoted one
            annotation: ref.annotations[0]?.body?.plain ?? null
        }))
        .filter(ref => ref.annotation);
}

// ─── SCRAPE LYRICS FROM GENIUS PAGE ──────────────────────────────────────────
// Genius doesn't serve lyrics through their API — it's a licensing restriction
// Instead they give us a URL to their webpage, and we scrape the lyrics from the HTML
// Cheerio is a server-side HTML parser — think of it like jQuery but for Node.js
// It lets us query the HTML with CSS selectors to find the lyrics container
export async function scrapeLyrics(url) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  
    const html = await response.text();
    const $ = cheerio.load(html);
  
    const chunks = [];
  
    $('[data-lyrics-container="true"]').each((_, element) => {
      $(element).find('br').replaceWith('\n');
      chunks.push($(element).text());
    });
  
    const lyrics = chunks.join('\n').trim();
  
    return lyrics;
  }

// Normalise whitespace in a string so multi-line fragments match reliably
// Genius fragments sometimes use \n, sometimes spaces, sometimes both
// Collapsing all whitespace sequences to a single space before matching
// means we don't miss fragments just because of inconsistent line breaks
function normaliseWhitespace(str) {
    return str
      // collapse all whitespace sequences to a single space
      .replace(/\s+/g, ' ')
      // replace smart/curly apostrophes and single quotes with straight quote
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      // replace smart/curly double quotes with straight double quote
      .replace(/[\u201C\u201D]/g, '"')
      .trim();
  }

// ─── MATCH FRAGMENTS TO LYRICS ───────────────────────────────────────────────
// Now we have two things:
// 1. The full lyrics text (from scraping)
// 2. The annotated fragments (from the referents API)
// 
// We need to match each fragment to its position in the full lyrics
// We do this by string-searching — finding where each fragment appears in the lyrics
// 
// Why not use Genius's built-in range/position data?
// Because it's notoriously unreliable — indexOf on the fragment string is more accurate

export function matchAnnotations(lyrics, referents) {
    const normalisedLyrics = normaliseWhitespace(lyrics).toLowerCase();
  
    return referents
      .map(ref => {
        const normalisedFragment = normaliseWhitespace(ref.fragment).toLowerCase();
        const charIndex = normalisedLyrics.indexOf(normalisedFragment);
  
        return {
          fragment: ref.fragment,      // keep original casing for display
          annotation: ref.annotation,
          charIndex
        };
      })
      .filter(ref => ref.charIndex !== -1);
  }