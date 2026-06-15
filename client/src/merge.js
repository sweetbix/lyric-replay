// ─── MERGE LYRICS AND ANNOTATIONS ────────────────────────────────────────────
// At this point we have two separate datasets:
// 1. Synced lyrics from LRC Lib — [{ time, text }]
// 2. Annotations from Genius — [{ fragment, annotation, charIndex }]
//
// We need to combine them so each lyric line knows if it has an annotation
// We do this by checking if any annotation fragment appears in each lyric line
//
// The result is a single array that drives the entire UI:
// [{ time, text, annotation }]
// annotation is null if no Genius annotation exists for that line

export function mergeLyricsAndAnnotations(lines, annotations) {
    // Pre-normalise once instead of per-line × per-annotation
    const prepared = annotations.map(ann => ({
        annotation: ann.annotation,
        normalisedFragment: normalise(ann.fragment)
    }));

    return lines.map(line => {
        const normalisedLine = normalise(line.text);

        // Skip very short lines (e.g. "Yeah", "Oh") — they'd match too many
        // fragments and produce false positives
        if (normalisedLine.length < 4) {
            return { time: line.time, text: line.text, annotation: null };
        }

        // Match in BOTH directions:
        //   1. line.includes(fragment) — short fragment fits inside the line
        //   2. fragment.includes(line) — line is part of a multi-line fragment
        // Direction 2 is the common case: Genius referents are usually whole
        // couplets/verses, and after whitespace normalisation the fragment
        // becomes one long string that contains each individual LRC line
        const match = prepared.find(ann =>
            normalisedLine.includes(ann.normalisedFragment) ||
            ann.normalisedFragment.includes(normalisedLine)
        );

        return {
            time: line.time,
            text: line.text,
            annotation: match?.annotation || null
        };
    });
}


// Same normalisation logic as the server
// Keeping it consistent means fragments that matched server-side
// will also match here on the client
function normalise(str) {
    return str
      .replace(/\s+/g, ' ')
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .toLowerCase()
      .trim();
  }