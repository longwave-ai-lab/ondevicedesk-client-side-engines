/**
 * Client-Side Whisper Subtitle Generator Worker
 * Produces compliant .SRT, .VTT, and word-level .JSON subtitle formats locally.
 */

export interface WordTiming {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
  confidence?: number;
}

export interface SubtitleSegment {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  words?: WordTiming[];
}

export interface SubtitleExportBundle {
  srt: string;
  vtt: string;
  json: string;
  segmentCount: number;
  wordCount: number;
  durationSeconds: number;
}

/**
 * Formats fractional seconds into SubRip timestamp: HH:MM:SS,mmm
 */
export function formatSecondsToSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Formats fractional seconds into WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatSecondsToVttTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Generates SubRip (.SRT) subtitle file content.
 */
export function generateSrt(segments: SubtitleSegment[]): string {
  if (segments.length === 0) return '';
  return segments
    .map((seg, idx) => {
      const segId = seg.id || idx + 1;
      const start = formatSecondsToSrtTimestamp(seg.start);
      const end = formatSecondsToSrtTimestamp(seg.end);
      return `${segId}\n${start} --> ${end}\n${seg.text.trim()}`;
    })
    .join('\n\n') + '\n';
}

/**
 * Generates WebVTT (.VTT) subtitle file content with header.
 */
export function generateVtt(segments: SubtitleSegment[]): string {
  const header = 'WEBVTT\n\n';
  if (segments.length === 0) return header;
  const body = segments
    .map((seg, idx) => {
      const segId = seg.id || idx + 1;
      const start = formatSecondsToVttTimestamp(seg.start);
      const end = formatSecondsToVttTimestamp(seg.end);
      return `${segId}\n${start} --> ${end}\n${seg.text.trim()}`;
    })
    .join('\n\n');
  return header + body + '\n';
}

/**
 * Generates word-level .JSON subtitle structure.
 */
export function generateWordLevelJson(segments: SubtitleSegment[]): string {
  return JSON.stringify({ segments }, null, 2);
}

/**
 * Produces full export bundle containing .SRT, .VTT, and word-level .JSON along with summary metrics.
 */
export function generateSubtitleBundle(segments: SubtitleSegment[]): SubtitleExportBundle {
  const srt = generateSrt(segments);
  const vtt = generateVtt(segments);
  const json = generateWordLevelJson(segments);

  let wordCount = 0;
  let maxEnd = 0;

  for (const seg of segments) {
    if (seg.words && seg.words.length > 0) {
      wordCount += seg.words.length;
    } else {
      wordCount += seg.text.trim().split(/\s+/).filter(Boolean).length;
    }
    if (seg.end > maxEnd) maxEnd = seg.end;
  }

  return {
    srt,
    vtt,
    json,
    segmentCount: segments.length,
    wordCount,
    durationSeconds: Number(maxEnd.toFixed(2)),
  };
}

/**
 * Parses raw text or transcribed output and builds timed subtitle segments
 * with estimated word boundaries if precise timings are missing.
 */
export function parseTranscribedSegments(
  text: string,
  totalDurationSeconds: number = 30
): SubtitleSegment[] {
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [];

  const timePerSentence = totalDurationSeconds / sentences.length;
  const segments: SubtitleSegment[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sStart = i * timePerSentence;
    const sEnd = (i + 1) * timePerSentence;
    const sentenceText = sentences[i];
    const words = sentenceText.split(/\s+/).filter(Boolean);
    const wordDur = (sEnd - sStart) / Math.max(1, words.length);

    const wordTimings: WordTiming[] = words.map((w, wIdx) => ({
      word: w,
      start: Number((sStart + wIdx * wordDur).toFixed(3)),
      end: Number((sStart + (wIdx + 1) * wordDur).toFixed(3)),
      confidence: 0.95,
    }));

    segments.push({
      id: i + 1,
      start: Number(sStart.toFixed(3)),
      end: Number(sEnd.toFixed(3)),
      text: sentenceText,
      words: wordTimings,
    });
  }

  return segments;
}

// Web Worker message listener
if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'generateSubtitles') {
        const { segments, text, totalDurationSeconds } = data;
        const resolvedSegments = segments && segments.length > 0
          ? segments
          : parseTranscribedSegments(text || '', totalDurationSeconds || 30);
        const result = generateSubtitleBundle(resolvedSegments);
        (self as any).postMessage({ id, result });
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}
