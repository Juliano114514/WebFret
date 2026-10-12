import { sourceCount, validateSourceScore, type ArrangementInfo, type SourceScore } from './sourceScore.ts';
export type { ArrangementInfo, SourceScore } from './sourceScore.ts';

export type Instrument = 'guitar' | 'ukulele-high' | 'ukulele-low';
export type Duration = 1 | 2 | 4 | 8 | 16 | 32;
export type Slide = 'none' | 'shift' | 'legato';
export interface FretNote {
  string: number;
  fret: number;
  tie: boolean;
  slide: Slide;
}
export interface Chord {
  name: string;
  frets: number[];
}
export interface Beat {
  id: string;
  duration: Duration;
  dotted: boolean;
  tuplet?: 3;
  notes: FretNote[];
  brush: 'none' | 'up' | 'down';
  lyrics: string[];
  chord: Chord | null;
}
export interface Measure {
  id: string;
  beats: Beat[];
  numerator?: number;
  denominator?: 2 | 4 | 8;
}
export interface EditableScore {
  kind: 'editable';
  instrument: Instrument;
  tempo: number;
  numerator: number;
  denominator: 2 | 4 | 8;
  capo: number;
  measures: Measure[];
  arrangement?: ArrangementInfo;
}
export interface ImportedGpScore {
  kind: 'guitar-pro';
  instrument: Instrument;
  originalName: string;
  base64: string;
  measureCount: number;
  trackCount: number;
  tempo: number;
}
export interface PracticeSegment {
  id: string;
  name: string;
  start: number;
  end: number;
}
export interface TrackMix {
  volume: number;
  muted: boolean;
  solo: boolean;
}
export interface PracticeSettings {
  blockSize: number;
  start: number;
  end: number;
  speed: number;
  looping: boolean;
  metronome: boolean;
  countIn: boolean;
  masterVolume: number;
  selectedTrack: number;
  trackMix: Record<string, TrackMix>;
  segments: PracticeSegment[];
}
export interface WebFretDocument {
  format: 'webfret';
  version: 1;
  id: string;
  title: string;
  artist: string;
  createdAt: string;
  updatedAt: string;
  score: EditableScore | ImportedGpScore | SourceScore;
  practice: PracticeSettings;
}
export interface CatalogEntry {
  id: string;
  title: string;
  artist: string;
  instrument: Instrument;
  instruments?: Instrument[];
  measureCount: number;
  file: string;
  kind: 'editable' | 'guitar-pro' | 'source';
}
export const instrumentNames: Record<Instrument, string> = {
  guitar: '吉他',
  'ukulele-high': '尤克里里 · High-G',
  'ukulele-low': '尤克里里 · Low-G',
};
// String 1 is the first string (the top line in tablature), not the lowest sounding string.
export const tunings: Record<Instrument, string[]> = {
  guitar: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  'ukulele-high': ['A4', 'E4', 'C4', 'G4'],
  'ukulele-low': ['A4', 'E4', 'C4', 'G3'],
};
export const chordPresets: Record<'guitar' | 'ukulele', Chord[]> = {
  guitar: [
    { name: 'C', frets: [0, 1, 0, 2, 3, -1] },
    { name: 'G', frets: [3, 0, 0, 0, 2, 3] },
    { name: 'Am', frets: [0, 1, 2, 2, 0, -1] },
    { name: 'F', frets: [1, 1, 2, 3, 3, 1] },
    { name: 'Dm', frets: [1, 3, 2, 0, -1, -1] },
    { name: 'Em', frets: [0, 0, 0, 2, 2, 0] },
    { name: 'D', frets: [2, 3, 2, 0, -1, -1] },
    { name: 'E', frets: [0, 0, 1, 2, 2, 0] },
  ],
  ukulele: [
    { name: 'C', frets: [3, 0, 0, 0] },
    { name: 'G', frets: [2, 3, 2, 0] },
    { name: 'Am', frets: [0, 0, 0, 2] },
    { name: 'F', frets: [0, 1, 0, 2] },
    { name: 'Dm', frets: [0, 1, 2, 2] },
    { name: 'Em', frets: [2, 3, 4, 0] },
    { name: 'D', frets: [0, 2, 2, 2] },
    { name: 'G7', frets: [2, 1, 2, 0] },
  ],
};
export function emptyBeat(duration: Duration = 4): Beat {
  return {
    id: crypto.randomUUID(),
    duration,
    dotted: false,
    notes: [],
    brush: 'none',
    lyrics: [],
    chord: null,
  };
}
export function emptyMeasure(numerator = 4, denominator: Duration = 4): Measure {
  return {
    id: crypto.randomUUID(),
    beats: Array.from({ length: numerator }, () => emptyBeat(denominator)),
  };
}
export function defaultPractice(count = 4): PracticeSettings {
  return {
    blockSize: 2,
    start: 1,
    end: Math.min(2, count),
    speed: 1,
    looping: true,
    metronome: false,
    countIn: false,
    masterVolume: 0.25,
    selectedTrack: 0,
    trackMix: {},
    segments: [],
  };
}
export function createDocument(instrument: Instrument, title = '未命名练习曲'): WebFretDocument {
  const now = new Date().toISOString();
  return {
    format: 'webfret',
    version: 1,
    id: crypto.randomUUID(),
    title,
    artist: '',
    createdAt: now,
    updatedAt: now,
    score: {
      kind: 'editable',
      instrument,
      tempo: 80,
      numerator: 4,
      denominator: 4,
      capo: 0,
      measures: Array.from({ length: 4 }, () => emptyMeasure()),
    },
    practice: defaultPractice(),
  };
}
export function measureCount(doc: WebFretDocument): number {
  return doc.score.kind === 'editable'
    ? doc.score.measures.length
    : doc.score.kind === 'source'
      ? sourceCount(doc.score)
      : doc.score.measureCount;
}
export function beatLength(beat: Pick<Beat, 'duration' | 'dotted' | 'tuplet'>): number {
  return (1 / beat.duration) * (beat.dotted ? 1.5 : 1) * (beat.tuplet === 3 ? 2 / 3 : 1);
}
export function measureLength(measure: Measure): number {
  return measure.beats.reduce((n, b) => n + beatLength(b), 0);
}
export function notesForChord(chord: Chord): FretNote[] {
  return chord.frets.flatMap((fret, i) =>
    fret < 0 ? [] : [{ string: i + 1, fret, tie: false, slide: 'none' as const }],
  );
}
export function copyDocument(doc: WebFretDocument): WebFretDocument {
  const copy = structuredClone(doc);
  copy.id = crypto.randomUUID();
  copy.updatedAt = copy.createdAt = new Date().toISOString();
  return copy;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('曲目结构无效');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error('文本无效或过长');
  return value;
}
function number(value: unknown, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error('曲目数值超出支持范围');
  return value;
}
function choice<T extends string | number>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error('曲目包含不支持的选项');
  return value as T;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('曲目列表无效或过长');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('曲目开关无效');
  return value;
}
function timestamp(value: unknown): string {
  const s = text(value, 40);
  if (!Number.isFinite(Date.parse(s))) throw new Error('曲目日期无效');
  return s;
}
export function validateDocument(input: unknown): WebFretDocument {
  const doc = object(input);
  if (doc.format !== 'webfret' || doc.version !== 1) throw new Error('仅支持 WebFret v1 曲目文件');
  const source = object(doc.score);
  const instrument = choice(source.instrument, ['guitar', 'ukulele-high', 'ukulele-low'] as const);
  let score: EditableScore | ImportedGpScore | SourceScore;
  if (source.kind === 'editable') {
    const numerator = number(source.numerator, 1, 12, true);
    const denominator = choice(source.denominator, [2, 4, 8] as const);
    const ids = new Set<string>();
    const id = (v: unknown) => {
      const s = text(v, 100);
      if (!s || ids.has(s)) throw new Error('小节或拍点 ID 重复');
      ids.add(s);
      return s;
    };
    const measures = list(source.measures, 2000).map((raw) => {
      const m = object(raw);
      const measureNumerator = m.numerator === undefined ? undefined : number(m.numerator, 1, 12, true);
      const measureDenominator = m.denominator === undefined ? undefined : choice(m.denominator, [2, 4, 8] as const);
      const beats = list(m.beats, 128).map((rawBeat) => {
        const b = object(rawBeat);
        const usedStrings = new Set<number>();
        const notes = list(b.notes, tunings[instrument].length).map((rawNote) => {
          const n = object(rawNote);
          const string = number(n.string, 1, tunings[instrument].length, true);
          if (usedStrings.has(string)) throw new Error('同一拍点的同一根弦不能重复');
          usedStrings.add(string);
          return {
            string,
            fret: number(n.fret, 0, 24, true),
            tie: bool(n.tie),
            slide: choice(n.slide, ['none', 'shift', 'legato'] as const),
          };
        });
        let chord: Chord | null = null;
        if (b.chord !== null) {
          const c = object(b.chord);
          const frets = list(c.frets, 6).map((v) => number(v, -1, 24, true));
          if (frets.length !== tunings[instrument].length) throw new Error('和弦弦数与乐器不符');
          chord = { name: text(c.name, 40), frets };
        }
        const beat: Beat = {
          id: id(b.id),
          duration: choice(b.duration, [1, 2, 4, 8, 16, 32] as const),
          dotted: bool(b.dotted),
          notes,
          brush: choice(b.brush, ['none', 'up', 'down'] as const),
          lyrics: list(b.lyrics, 4).map((v) => text(v, 100)),
          chord,
        };
        if (b.tuplet !== undefined) beat.tuplet = choice(b.tuplet, [3] as const);
        return beat;
      });
      const measure: Measure = { id: id(m.id), beats };
      if (measureNumerator !== undefined) measure.numerator = measureNumerator;
      if (measureDenominator !== undefined) measure.denominator = measureDenominator;
      if (!beats.length || measureLength(measure) > (measureNumerator ?? numerator) / (measureDenominator ?? denominator) + 0.00001)
        throw new Error('小节为空或时值超过拍号容量');
      return measure;
    });
    if (!measures.length) throw new Error('曲目至少需要一个小节');
    let previous: Beat | undefined;
    let totalBeats = 0;
    for (const measure of measures)
      for (const beat of measure.beats) {
        totalBeats++;
        for (const note of beat.notes)
          if (
            note.tie &&
            !previous?.notes.some((n) => n.string === note.string && n.fret === note.fret)
          )
            throw new Error('延音必须承接前一拍的同弦同品音符，请先清除无效延音');
        previous = beat;
      }
    if (totalBeats > 32000) throw new Error('基础谱最多支持 32000 个拍点');
    score = {
      kind: 'editable',
      instrument,
      tempo: number(source.tempo, 20, 300, true),
      numerator,
      denominator,
      capo: number(source.capo, 0, 12, true),
      measures,
    };
    if (source.arrangement !== undefined) {
      const a = object(source.arrangement);
      score.arrangement = {
        scenario: choice(a.scenario, ['guitar-accompaniment', 'guitar-fingerstyle', 'ukulele-accompaniment', 'ukulele-fingerstyle'] as const),
        sourceId: text(a.sourceId, 100),
        key: text(a.key, 40),
        summary: list(a.summary, 200).map((v) => text(v, 1000)),
        suggested: bool(a.suggested),
      };
      if (a.sourceIds !== undefined) score.arrangement.sourceIds = list(a.sourceIds, 8).map((v) => text(v, 100));
      if (a.originSongId !== undefined) score.arrangement.originSongId = text(a.originSongId, 100);
    }
  } else if (source.kind === 'guitar-pro') {
    const base64 = text(source.base64, Math.ceil((10 * 1024 * 1024) / 3) * 4);
    if (
      !base64 ||
      base64.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
    )
      throw new Error('GP 原文件编码无效');
    score = {
      kind: 'guitar-pro',
      instrument,
      originalName: text(source.originalName, 200),
      base64,
      measureCount: number(source.measureCount, 1, 5000, true),
      trackCount: number(source.trackCount, 1, 64, true),
      tempo: number(source.tempo, 1, 1000),
    };
  } else if (source.kind === 'source') score = validateSourceScore(source);
  else throw new Error('不支持的曲目类型');
  const count = score.kind === 'editable' ? score.measures.length : score.kind === 'source' ? sourceCount(score) : score.measureCount;
  const p = object(doc.practice);
  const trackMix: Record<string, TrackMix> = {};
  for (const [key, value] of Object.entries(object(p.trackMix))) {
    if (!/^\d{1,2}$/.test(key) || Number(key) >= 64) throw new Error('音轨设置无效');
    const mix = object(value);
    trackMix[key] = {
      volume: number(mix.volume, 0, 1),
      muted: bool(mix.muted),
      solo: bool(mix.solo),
    };
  }
  const practice: PracticeSettings = {
    blockSize: number(p.blockSize, 1, 128, true),
    start: number(p.start, 1, count, true),
    end: number(p.end, 1, count, true),
    speed: number(p.speed, 0.25, 1.5),
    looping: bool(p.looping),
    metronome: bool(p.metronome),
    countIn: bool(p.countIn),
    masterVolume: number(p.masterVolume ?? 0.25, 0, 1),
    selectedTrack: number(
      p.selectedTrack,
      0,
      score.kind === 'guitar-pro' ? score.trackCount - 1 : 0,
      true,
    ),
    trackMix,
    segments: list(p.segments, 100).map((raw) => {
      const s = object(raw);
      const start = number(s.start, 1, count, true);
      const end = number(s.end, start, count, true);
      return { id: text(s.id, 100), name: text(s.name, 80), start, end };
    }),
  };
  if (practice.end < practice.start) throw new Error('练习片段的结束小节不能早于开始小节');
  const documentId = text(doc.id, 100);
  if (!documentId.trim()) throw new Error('曲目 ID 不能为空');
  return {
    format: 'webfret',
    version: 1,
    id: documentId,
    title: text(doc.title),
    artist: text(doc.artist),
    createdAt: timestamp(doc.createdAt),
    updatedAt: timestamp(doc.updatedAt),
    score,
    practice,
  };
}
