import { chordPresets, defaultPractice, tunings, validateDocument, type Beat, type Chord, type Duration, type EditableScore, type FretNote, type Instrument, type Measure, type WebFretDocument } from './model.ts';
export type SourceNotation = 'tablature' | 'numbered' | 'chord-chart';
export type SourceOrigin = 'source' | 'manual' | 'suggested' | 'missing';
export type Scenario = 'guitar-accompaniment' | 'guitar-fingerstyle' | 'ukulele-accompaniment' | 'ukulele-fingerstyle';
export interface ArrangementInfo {
  scenario: Scenario;
  sourceId: string;
  sourceIds?: string[];
  originSongId?: string;
  key: string;
  summary: string[];
  suggested: boolean;
}
export interface SourceEvent {
  id: string;
  degree: number | null;
  octave: number;
  accidental: -1 | 0 | 1;
  notes: {
    string: number;
    fret: number;
  }[];
  duration: Duration | null;
  dotted: boolean;
  tuplet?: 3 | null;
  tie: boolean;
  lyric: string;
  raw: string;
  review: string;
  durationOrigin: SourceOrigin;
  fingeringOrigin: SourceOrigin;
}
export interface SourceLine {
  id: string;
  label: string;
  page: number;
  lyrics: string;
  raw: string;
  review: string;
  bar: boolean;
  numerator: number | null;
  denominator: 2 | 4 | 8 | null;
  events: SourceEvent[];
  chordChanges: {
    at: number;
    name: string;
  }[];
}
export interface SourceVersion {
  id: string;
  title: string;
  notation: SourceNotation;
  instrument: Instrument;
  key: string;
  tempo: number | null;
  numerator: number | null;
  denominator: 2 | 4 | 8 | null;
  capo: number | null;
  pages: {
    id: string;
    label: string;
    image: string;
  }[];
  lines: SourceLine[];
  chords: {
    name: string;
    frets: number[];
    fingers: (number | null)[];
    note: string;
  }[];
  notes: string[];
}
export interface SourceScore {
  kind: 'source';
  instrument: Instrument;
  melodySourceId: string;
  versions: SourceVersion[];
}
const origins = ['source', 'manual', 'suggested', 'missing'] as const;
const durations = [1, 2, 4, 8, 16, 32] as const;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('原谱结构无效');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('原谱文本无效或过长');
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('原谱数值超出支持范围');
  return value;
}
function choice<T extends string | number>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error('原谱包含不支持的选项');
  return value as T;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('原谱列表无效或过长');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('原谱开关无效');
  return value;
}
function nullableNumber(value: unknown, min: number, max: number): number | null {
  return value === null ? null : number(value, min, max);
}
function nullableChoice<T extends string | number>(value: unknown, options: readonly T[]): T | null {
  return value === null ? null : choice(value, options);
}
export function sourceCount(score: SourceScore): number {
  return Math.max(1, ...score.versions.map(version => version.lines.length));
}

// Accept raster data only: documents remain self-contained, with no remote fetch or script URL.
function imageData(value: unknown): string {
  const data = text(value, Math.ceil(4 * 1024 * 1024 / 3) * 4 + 40);
  const match = /^data:image\/(jpeg|png|webp);base64,/.exec(data);
  if (!match) throw new Error('原图仅支持内嵌 JPEG、PNG 或 WebP');
  const encoded = data.slice(match[0].length);
  if (encoded.length < 24 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('原图编码无效');
  const bytes = Uint8Array.from(atob(encoded.slice(0, 24)), char => char.charCodeAt(0));
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(match[1] === 'jpeg' ? isJpeg : match[1] === 'png' ? isPng : isWebp)) throw new Error('原图文件头与图片格式不符');
  return data;
}
export function validateSourceScore(input: unknown): SourceScore {
  const score = object(input);
  if (score.kind !== 'source') throw new Error('原谱类型无效');
  const ids = new Set<string>();
  const id = (value: unknown) => {
    const result = text(value, 100);
    if (!result.trim() || ids.has(result)) throw new Error('原谱 ID 为空或重复');
    ids.add(result);
    return result;
  };
  let imageChars = 0;
  let eventCount = 0;
  const versions = list(score.versions, 8).map(raw => {
    const source = object(raw);
    const versionId = id(source.id);
    const instrument = choice(source.instrument, ['guitar', 'ukulele-high', 'ukulele-low'] as const);
    const notation = choice(source.notation, ['tablature', 'numbered', 'chord-chart'] as const);
    const numerator = nullableNumber(source.numerator, 1, 12);
    const denominator = nullableChoice(source.denominator, [2, 4, 8] as const);
    const pages = list(source.pages, 16).map(rawPage => {
      const p = object(rawPage);
      const image = imageData(p.image);
      imageChars += image.length;
      if (imageChars > 16 * 1024 * 1024) throw new Error('一首歌内嵌原图总量不能超过 12 MB 图片数据');
      return {
        id: id(p.id),
        label: text(p.label),
        image
      };
    });
    const lines = list(source.lines, 2000).map(rawLine => {
      const line = object(rawLine);
      const lineId = id(line.id);
      const lyrics = text(line.lyrics, 2000);
      const events = list(line.events, 1024).map(rawEvent => {
        if (++eventCount > 32000) throw new Error('一首歌原谱最多支持 32000 个事件');
        const event = object(rawEvent);
        const usedStrings = new Set<number>();
        const notes = list(event.notes, tunings[instrument].length).map(rawNote => {
          const n = object(rawNote);
          const string = number(n.string, 1, tunings[instrument].length);
          if (usedStrings.has(string)) throw new Error('原谱事件同一根弦不能重复');
          usedStrings.add(string);
          return {
            string,
            fret: number(n.fret, 0, 24)
          };
        });
        const duration = nullableChoice(event.duration, durations);
        const durationOrigin = choice(event.durationOrigin, origins);
        if (duration === null !== (durationOrigin === 'missing')) throw new Error('原谱时值与来源标记不一致');
        const fingeringOrigin = choice(event.fingeringOrigin, origins);
        if (notes.length && fingeringOrigin === 'missing') throw new Error('原谱已录入弦品却标记指型缺失，请校对指型来源');
        return {
          id: id(event.id),
          degree: nullableNumber(event.degree, 0, 7),
          octave: number(event.octave, -4, 4),
          accidental: choice(event.accidental, [-1, 0, 1] as const),
          notes,
          duration,
          dotted: bool(event.dotted),
          tuplet: event.tuplet === undefined || event.tuplet === null ? null : choice(event.tuplet, [3] as const),
          tie: bool(event.tie),
          lyric: text(event.lyric, 100),
          raw: text(event.raw, 500),
          review: text(event.review, 1000),
          durationOrigin,
          fingeringOrigin
        } satisfies SourceEvent;
      });
      const review = text(line.review, 2000);
      const bar = bool(line.bar);
      const lineNumerator = nullableNumber(line.numerator, 1, 12);
      const lineDenominator = nullableChoice(line.denominator, [2, 4, 8] as const);
      const n = lineNumerator ?? numerator;
      const d = lineDenominator ?? denominator;
      if (bar && n && d && !review && events.every(e => e.duration !== null && !e.review)) {
        const length = events.reduce((sum, event) => sum + 1 / event.duration! * (event.dotted ? 1.5 : 1) * (event.tuplet === 3 ? 2 / 3 : 1), 0);
        if (length > n / d + 0.00001) throw new Error('原谱已确认小节的时值超过拍号容量，请校对或标注待核');
      }
      const changePositions = new Set<number>();
      const chordChanges = list(line.chordChanges, 1024).map(rawChange => {
        const change = object(rawChange);
        const at = number(change.at, 0, notation === 'chord-chart' ? lyrics.length : events.length);
        if (notation !== 'chord-chart' && changePositions.has(at)) throw new Error('原谱同一位置的和弦重复');
        changePositions.add(at);
        return {
          at,
          name: text(change.name, 40)
        };
      });
      chordChanges.sort((a, b) => a.at - b.at);
      return {
        id: lineId,
        label: text(line.label),
        page: number(line.page, 0, Math.max(0, pages.length - 1)),
        lyrics,
        raw: text(line.raw, 10000),
        review,
        bar,
        numerator: lineNumerator,
        denominator: lineDenominator,
        events,
        chordChanges
      } satisfies SourceLine;
    });
    const chords = list(source.chords, 100).map(rawChord => {
      const chord = object(rawChord);
      const frets = list(chord.frets, 6).map(v => number(v, -1, 24));
      const fingers = list(chord.fingers, 6).map(v => nullableNumber(v, 0, 4));
      if (frets.length && frets.length !== tunings[instrument].length) throw new Error('原谱和弦弦数与乐器不符');
      if (fingers.length && fingers.length !== frets.length) throw new Error('原谱和弦手指数与弦数不符');
      return {
        name: text(chord.name, 40),
        frets,
        fingers,
        note: text(chord.note, 1000)
      };
    });
    return {
      id: versionId,
      title: text(source.title),
      notation,
      instrument,
      key: text(source.key, 40),
      tempo: nullableNumber(source.tempo, 20, 300),
      numerator,
      denominator,
      capo: nullableNumber(source.capo, 0, 12),
      pages,
      lines,
      chords,
      notes: list(source.notes, 100).map(v => text(v, 2000))
    } satisfies SourceVersion;
  });
  if (!versions.length) throw new Error('曲目至少需要一个原谱版本');
  const melodySourceId = text(score.melodySourceId, 100);
  if (!versions.some(v => v.id === melodySourceId)) throw new Error('共同旋律来源不存在');
  return {
    kind: 'source',
    instrument: choice(score.instrument, ['guitar', 'ukulele-high', 'ukulele-low'] as const),
    melodySourceId,
    versions
  };
}
export function createSourceDocument(instrument: Instrument, title = '未命名原谱', notation: SourceNotation = 'numbered'): WebFretDocument {
  const now = new Date().toISOString();
  const version: SourceVersion = {
    id: crypto.randomUUID(),
    title: '原谱版本 1',
    notation,
    instrument,
    key: '',
    tempo: null,
    numerator: null,
    denominator: null,
    capo: null,
    pages: [],
    lines: [],
    chords: [],
    notes: []
  };
  return {
    format: 'webfret',
    version: 1,
    id: crypto.randomUUID(),
    title,
    artist: '',
    createdAt: now,
    updatedAt: now,
    score: {
      kind: 'source',
      instrument,
      melodySourceId: version.id,
      versions: [version]
    },
    practice: defaultPractice(1)
  };
}
const majorScale = [0, 2, 4, 5, 7, 9, 11];
const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const naturalPitch: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};
function keyPitch(key: string): number | null {
  const match = /^(?:1\s*=\s*)?([A-Ga-g])([#♯b♭]?)(?:\s*(?:调|大调|major))?$/.exec(key.trim());
  if (!match) return null;
  return (naturalPitch[match[1].toUpperCase()] + (match[2] === '#' || match[2] === '♯' ? 1 : match[2] ? -1 : 0) + 12) % 12;
}
function midi(pitch: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(pitch)!;
  return (Number(match[3]) + 1) * 12 + naturalPitch[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
}
function position(pitch: number, instrument: Instrument, previous?: FretNote): FretNote | null {
  const choices = tunings[instrument].flatMap((tuning, index) => {
    const fret = pitch - midi(tuning);
    return fret < 0 || fret > 24 ? [] : [{
      string: index + 1,
      fret,
      tie: false,
      slide: 'none' as const
    }];
  });
  choices.sort((a, b) => {
    const cost = (note: FretNote) => note.fret + (previous ? Math.abs(note.fret - previous.fret) * 0.4 + Math.abs(note.string - previous.string) * 0.6 : 0);
    return cost(a) - cost(b) || a.string - b.string;
  });
  return choices[0] ?? null;
}

// Conventional shapes are transposed as complete voicings; unknown chord qualities stay unknown.
const extraShapes: Record<'guitar' | 'ukulele', Chord[]> = {
  guitar: [{
    name: 'Cmaj7',
    frets: [0, 0, 0, 2, 3, -1]
  }, {
    name: 'Am7',
    frets: [0, 1, 0, 2, 0, -1]
  }, {
    name: 'G7',
    frets: [1, 0, 0, 0, 2, 3]
  }, {
    name: 'D7',
    frets: [2, 1, 2, 0, -1, -1]
  }, {
    name: 'Dm7',
    frets: [1, 1, 2, 0, -1, -1]
  }],
  ukulele: [{
    name: 'Cmaj7',
    frets: [2, 0, 0, 0]
  }, {
    name: 'C7',
    frets: [1, 0, 0, 0]
  }, {
    name: 'Am7',
    frets: [0, 0, 0, 0]
  }, {
    name: 'Gm7',
    frets: [1, 1, 2, 0]
  }]
};
const chordIntervals: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 2, 4, 7],
  '6/9': [0, 2, 4, 7, 9],
  '7#5': [0, 4, 8, 10],
  dim7: [0, 3, 6, 9]
};
function notePitch(name: string): number {
  return (naturalPitch[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
}
function chordParts(name: string): {
  root: number;
  quality: string;
  bass: number | null;
} | null {
  const match = /^([A-G][#b]?)(maj7|m7|7sus4|7#5|6\/9|dim7|add9|sus4|m|7|)(?:\/([A-G][#b]?))?$/.exec(name);
  return match ? {
    root: notePitch(match[1]),
    quality: match[2],
    bass: match[3] ? notePitch(match[3]) : null
  } : null;
}
function normalizeChord(name: string, sourceKey: number | null, targetKey: number): string | null {
  const clean = name.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/⁷/g, '7');
  const numeric = /^([b#]?)([1-7])([b#]?)(M7|maj7|m7|7sus|7\+5|°7|\(6\.9\)|\(2\)|sus|m|7|)(?:\/([b#]?)([1-7])([b#]?))?$/.exec(clean);
  if (numeric) {
    const alter = [numeric[1], numeric[3]].reduce((sum, part) => sum + (part === 'b' ? -1 : part === '#' ? 1 : 0), 0);
    const pitch = (targetKey + majorScale[Number(numeric[2]) - 1] + alter + 12) % 12;
    const quality = ({
      M7: 'maj7',
      '7sus': '7sus4',
      '7+5': '7#5',
      '°7': 'dim7',
      '(6.9)': '6/9',
      '(2)': 'add9',
      sus: 'sus4'
    } as Record<string, string>)[numeric[4]] ?? numeric[4];
    const bassAlter = [numeric[5], numeric[7]].reduce((sum, part) => sum + (part === 'b' ? -1 : part === '#' ? 1 : 0), 0);
    const bass = numeric[6] ? '/' + sharpNames[(targetKey + majorScale[Number(numeric[6]) - 1] + bassAlter + 12) % 12] : '';
    return sharpNames[pitch] + quality + bass;
  }
  const normalized = clean.replace(/M7(?=\/|$)/, 'maj7').replace(/7sus(?=\/|$)/, '7sus4').replace(/sus(?=\/|$)/, 'sus4');
  const parts = chordParts(normalized);
  if (!parts || sourceKey === null) return null;
  return sharpNames[(parts.root + targetKey - sourceKey + 12) % 12] + parts.quality + (parts.bass === null ? '' : '/' + sharpNames[(parts.bass + targetKey - sourceKey + 12) % 12]);
}
function inferredShape(name: string, instrument: Instrument): Chord | null {
  const parts = chordParts(name)!;
  const intervals = chordIntervals[parts.quality];
  if (!intervals) return null;
  const pitches = new Set(intervals.map(interval => (parts.root + interval) % 12));
  if (parts.bass !== null) pitches.add(parts.bass);
  // The fifth may be omitted in extended voicings; root, third/suspension and colours remain.
  const required = intervals.filter(interval => intervals.length <= 3 || interval !== 7).map(interval => (parts.root + interval) % 12);
  if (parts.bass !== null) required.push(parts.bass);
  if (new Set(required).size > tunings[instrument].length) return null;
  const strings = tunings[instrument].map(tuning => midi(tuning));
  const candidates = strings.map(open => [-1, ...Array.from({
    length: 13
  }, (_, fret) => fret).filter(fret => pitches.has((open + fret) % 12))]);
  let best: number[] | null = null;
  let bestCost = Infinity;
  const walk = (index: number, frets: number[], min: number, max: number) => {
    if (index < strings.length) {
      for (const fret of candidates[index]) {
        const low = fret > 0 ? Math.min(min, fret) : min;
        const high = fret > 0 ? Math.max(max, fret) : max;
        if (high - low > 4) continue;
        walk(index + 1, [...frets, fret], low, high);
      }
      return;
    }
    const played = frets.flatMap((fret, i) => fret < 0 ? [] : [strings[i] + fret]);
    if (played.length < Math.min(3, strings.length) || !required.every(pitch => played.some(midi => midi % 12 === pitch))) return;
    const lowest = Math.min(...played) % 12;
    if (parts.bass !== null && lowest !== parts.bass) return;
    const cost = Math.max(0, max) * 2 + (Number.isFinite(min) ? max - min : 0) * 2 + frets.reduce((sum, fret) => sum + Math.max(fret, 0) * 0.1 + (fret < 0 ? 1 : 0), 0) + (parts.bass === null && lowest !== parts.root ? 2 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = frets;
    }
  };
  walk(0, [], Infinity, 0);
  return best === null ? null : {
    name,
    frets: best
  };
}
function chordShape(name: string, instrument: Instrument): Chord | null {
  const parts = chordParts(name);
  if (!parts) return null;
  const family = instrument === 'guitar' ? 'guitar' : 'ukulele';
  const shapes = [...chordPresets[family], ...extraShapes[family]];
  const candidates = shapes.flatMap(shape => {
    const base = chordParts(shape.name)!;
    if (base.quality !== parts.quality || parts.bass !== null) return [];
    const shift = (parts.root - base.root + 12) % 12;
    const frets = shape.frets.map(fret => fret < 0 ? fret : fret + shift);
    return Math.max(...frets) > 12 ? [] : [{
      name,
      frets
    }];
  });
  candidates.sort((a, b) => Math.max(...a.frets) - Math.max(...b.frets));
  return candidates[0] ?? inferredShape(name, instrument);
}
interface TimedBeat {
  beat: Beat;
  chord: Chord | null;
}
interface TimedMeasure {
  measure: Measure;
  events: TimedBeat[];
  numerator: number;
  denominator: 2 | 4 | 8;
}
const rhythmValues = durations.flatMap(duration => [{
  duration,
  dotted: false,
  tuplet: undefined,
  ticks: 192 / duration
}, {
  duration,
  dotted: true,
  tuplet: undefined,
  ticks: 288 / duration
}, {
  duration,
  dotted: false,
  tuplet: 3 as const,
  ticks: 128 / duration
}, {
  duration,
  dotted: true,
  tuplet: 3 as const,
  ticks: 192 / duration
}]).sort((a, b) => b.ticks - a.ticks);
function splitRhythm(ticks: number): {
  duration: Duration;
  dotted: boolean;
  tuplet?: 3;
  ticks: number;
}[] {
  if (!Number.isInteger(ticks) || ticks < 4) throw new Error('跨小节时值需要基础谱尚不支持的节奏细分，请调整练习节奏');
  const choices = Array.from({
    length: ticks + 1
  }, () => -1);
  choices[0] = -2;
  for (let amount = 4; amount <= ticks; amount++) {
    const index = rhythmValues.findIndex(value => value.ticks <= amount && choices[amount - value.ticks] !== -1);
    if (index >= 0) choices[amount] = index;
  }
  if (choices[ticks] < 0) throw new Error('时值无法表示为当前基础谱支持的节奏');
  const result = [];
  while (ticks > 0) {
    const value = rhythmValues[choices[ticks]];
    result.push(value);
    ticks -= value.ticks;
  }
  return result;
}
function beatTicks(beat: Beat): number {
  return (beat.dotted ? 288 : 192) / beat.duration * (beat.tuplet === 3 ? 2 / 3 : 1);
}
function newBeat(duration: Duration, dotted: boolean, notes: FretNote[], lyrics: string[], chord: Chord | null, tuplet?: 3): Beat {
  const beat: Beat = {
    id: crypto.randomUUID(),
    duration,
    dotted,
    notes,
    lyrics,
    chord,
    brush: 'none'
  };
  if (tuplet === 3) beat.tuplet = tuplet;
  return beat;
}
export function completeSource(document: WebFretDocument, scenario: Scenario, options: {
  key: string;
  tempo: number;
  fallbackDuration: Duration;
  allowApproximate: boolean;
  ukuleleTuning?: 'ukulele-high' | 'ukulele-low';
}): WebFretDocument {
  const doc = validateDocument(document);
  if (doc.score.kind !== 'source') throw new Error('只能由原谱生成独立练习版');
  const sourceScore = doc.score;
  choice(scenario, ['guitar-accompaniment', 'guitar-fingerstyle', 'ukulele-accompaniment', 'ukulele-fingerstyle'] as const);
  const fingerstyle = scenario.endsWith('fingerstyle');
  choice(options.fallbackDuration, durations);
  number(options.tempo, 20, 300);
  bool(options.allowApproximate);
  const targetKey = keyPitch(options.key);
  if (targetKey === null) throw new Error('练习调性请填写 C、D、Bb 等大调主音');
  const source = sourceScore.versions.find(v => v.id === sourceScore.melodySourceId)!;
  if (source.notation === 'chord-chart' || !source.lines.some(line => line.events.length)) throw new Error('共同旋律来源需要数字谱或六线谱事件；和弦歌词位置不能推导旋律及精确时值');
  const sourceKey = keyPitch(source.key);
  if (fingerstyle && source.notation === 'tablature' && sourceKey === null) throw new Error('六线谱需先确认原调，才能生成按目标调性编配的练习版');
  const instrument: Instrument = scenario.startsWith('guitar-') ? 'guitar' : options.ukuleleTuning === undefined ? 'ukulele-high' : choice(options.ukuleleTuning, ['ukulele-high', 'ukulele-low'] as const);
  const summary = new Set<string>();
  summary.add(`共同旋律、歌词和时值来自「${source.title}」；其他原谱未按歌词字符位置强行同步。`);
  const missing = source.lines.flatMap(line => line.events).filter(event => event.duration === null).length;
  if (missing && !options.allowApproximate) throw new Error(`原谱有 ${missing} 个事件缺少时值；请明确允许等分练习节奏，或先手动补全`);
  if (missing) summary.add(`${missing} 个缺失时值采用等分 ${options.fallbackDuration} 分音符练习假设，不能视作原曲节奏恢复。`);
  if (source.lines.some(line => line.review || line.events.some(event => event.review))) summary.add('共同旋律包含待核信息；练习版继承当前录入内容，需要继续对照原图校对。');
  if (source.notation === 'tablature' && source.capo === null) summary.add('六线谱未注明变调夹，练习版按不夹变调夹计算音高。');
  const transpose = source.notation === 'tablature' ? (targetKey - sourceKey! + 18) % 12 - 6 : 0;
  const melodyPitches = source.lines.flatMap(line => line.events.flatMap(event => {
    if (event.degree !== null) return event.degree === 0 ? [] : [60 + targetKey + majorScale[event.degree - 1] + event.octave * 12 + event.accidental];
    return event.notes.map(note => midi(tunings[source.instrument][note.string - 1]) + note.fret + (source.capo ?? 0) + transpose);
  }));
  const globalOctaveShift = [0, -12, 12, -24, 24].find(shift => melodyPitches.every(pitch => position(pitch + shift, instrument) !== null));
  const octaveShift = fingerstyle ? globalOctaveShift ?? 0 : 0;
  if (octaveShift) summary.add(`为适应目标乐器音域，练习版全曲${octaveShift < 0 ? '降低' : '升高'} ${Math.abs(octaveShift / 12)} 个八度；这是练习音区建议，原谱音区保持不变。`);
  const foldedNotes = new Map<string, {
    count: number;
    examples: Set<string>;
  }>();
  const playablePosition = (pitch: number, line: SourceLine, event: SourceEvent): FretNote => {
    const direct = position(pitch, instrument, previousNote);
    if (direct) return direct;
    const shift = [-12, 12, -24, 24].find(value => position(pitch + value, instrument) !== null);
    if (shift === undefined) throw new Error(`「${line.label}」的 ${event.raw || event.degree} 无法按同音级八度折回目标乐器，请手动调整音区`);
    const note = position(pitch + shift, instrument, previousNote)!;
    const record = foldedNotes.get(line.label) ?? {
      count: 0,
      examples: new Set<string>()
    };
    record.count++;
    record.examples.add(`${event.raw || event.degree} ${shift < 0 ? '降' : '升'}${Math.abs(shift / 12)}个八度`);
    foldedNotes.set(line.label, record);
    return note;
  };
  if (source.lines.some(line => line.lyrics && line.events.length && line.events.every(event => !event.lyric))) summary.add('部分小节仅录有整句歌词，暂关联到该小节首拍；逐字演唱位置尚未校定。');
  if (source.tempo !== options.tempo) summary.add(`练习速度设为 ${options.tempo} BPM，不作为原曲速度的识别结论。`);
  const numerator = source.numerator ?? 4;
  const denominator = source.denominator ?? 4;
  if (source.numerator === null || source.denominator === null) summary.add('原谱拍号不全，练习版缺失部分采用 4/4 假设。');
  const timed: TimedMeasure[] = [];
  let current: TimedMeasure | null = null;
  let activeChord: Chord | null = null;
  let previousNote: FretNote | undefined;
  let previousSourceNotes: FretNote[] = [];
  let confirmedFingeringRelocated = false;
  let total = 0;
  const chordCache = new Map<string, Chord | null>();
  const suggestedChords = new Set<string>();
  const unknownChords = new Set<string>();
  const resolveChord = (name: string): Chord | null => {
    if (chordCache.has(name)) return chordCache.get(name)!;
    const normalized = normalizeChord(name, sourceKey, targetKey);
    const original = source.chords.find(chord => chord.name === name && chord.frets.length === tunings[instrument].length);
    const useOriginal = source.instrument === instrument && sourceKey === targetKey && (source.capo ?? 0) === 0 && original;
    const chord = useOriginal ? {
      name: normalized ?? name,
      frets: [...original.frets]
    } : normalized ? chordShape(normalized, instrument) : null;
    if (!chord) unknownChords.add(name);else if (!useOriginal) suggestedChords.add(name);
    chordCache.set(name, chord);
    return chord;
  };
  const begin = (n: number, d: 2 | 4 | 8) => {
    if (timed.length >= 2000) throw new Error('练习版最多支持 2000 个小节');
    const measure: Measure = {
      id: crypto.randomUUID(),
      beats: []
    };
    if (n !== numerator || d !== denominator) {
      measure.numerator = n;
      measure.denominator = d;
    }
    const result: TimedMeasure = {
      measure,
      events: [],
      numerator: n,
      denominator: d
    };
    timed.push(result);
    return result;
  };
  const append = (beat: Beat, chord: Chord | null) => {
    if (++total > 32000) throw new Error('练习版最多支持 32000 个拍点');
    current!.measure.beats.push(beat);
    current!.events.push({
      beat,
      chord
    });
  };
  for (const line of source.lines) {
    const n = line.numerator ?? numerator;
    const d = line.denominator ?? denominator;
    if (line.bar || !current || current.numerator !== n || current.denominator !== d) current = null;
    const changes = new Map(line.chordChanges.map(change => [change.at, change.name]));
    for (let index = 0; index < line.events.length; index++) {
      const event = line.events[index];
      const chordName = changes.get(index);
      if (chordName !== undefined) activeChord = resolveChord(chordName);
      let notes: FretNote[] = [];
      if (!fingerstyle) {
        notes = [];
      } else if (event.degree !== null && event.notes.length && (event.fingeringOrigin === 'manual' || event.fingeringOrigin === 'source')) {
        if (event.degree === 0) throw new Error(`「${line.label}」的休止符包含已确认弦品，请先校对音级或指型`);
        if (sourceKey === null) throw new Error('已确认数字谱指型需要先注明原调，才能校对弦品音高');
        const sourcePitch = 60 + sourceKey + majorScale[event.degree - 1] + event.octave * 12 + event.accidental;
        const originalPitches = event.notes.map(note => midi(tunings[source.instrument][note.string - 1]) + note.fret + (source.capo ?? 0));
        if (!originalPitches.includes(sourcePitch)) throw new Error(`「${line.label}」的 ${event.raw || event.degree} 与已确认弦品音高不符，请校对原调、音区或弦品`);
        const melodyNote = playablePosition(60 + targetKey + majorScale[event.degree - 1] + event.octave * 12 + event.accidental + octaveShift, line, event);
        const targetPitch = midi(tunings[instrument][melodyNote.string - 1]) + melodyNote.fret;
        const pitchShift = targetPitch - sourcePitch;
        if (event.notes.length > tunings[instrument].length) throw new Error(`「${line.label}」的已确认同时音数量超过目标乐器弦数，无法完整保留，请手动选择指型`);
        const preservePositions = source.instrument === instrument && pitchShift === 0 && (source.capo ?? 0) === 0;
        const choices = originalPitches.map((pitch, index) => {
          const preferredString = source.instrument === instrument ? event.notes[index].string : null;
          return tunings[instrument].flatMap((tuning, stringIndex) => {
            const fret = pitch + pitchShift - midi(tuning);
            return fret < 0 || fret > 24 ? [] : [{
              string: stringIndex + 1,
              fret,
              tie: false,
              slide: 'none' as const
            }];
          }).filter(note => (!preservePositions || note.string === event.notes[index].string) && (!event.tie || previousSourceNotes.some(previous => previous.string === note.string && previous.fret === note.fret))).sort((a, b) => Number(b.string === preferredString) - Number(a.string === preferredString) || a.fret - b.fret || a.string - b.string);
        });
        const assign = (index: number, used: Set<number>, selected: FretNote[]): FretNote[] | null => {
          if (index === choices.length) return selected;
          for (const note of choices[index]) {
            if (used.has(note.string)) continue;
            used.add(note.string);
            const assigned = assign(index + 1, used, [...selected, note]);
            if (assigned) return assigned;
            used.delete(note.string);
          }
          return null;
        };
        const assigned = assign(0, new Set<number>(), []);
        if (!assigned) throw new Error(`「${line.label}」的已确认同时音无法无碰撞地完整映射到目标乐器，请手动选择可弹指型`);
        notes = assigned;
        previousNote = notes.find(note => midi(tunings[instrument][note.string - 1]) + note.fret === targetPitch);
        if (source.instrument !== instrument || pitchShift !== 0 || (source.capo ?? 0) !== 0 || notes.some((note, index) => note.string !== event.notes[index].string || note.fret !== event.notes[index].fret)) confirmedFingeringRelocated = true;
      } else if (event.degree !== null && event.degree > 0) {
        const pitch = 60 + targetKey + majorScale[event.degree - 1] + event.octave * 12 + event.accidental + octaveShift;
        const note = playablePosition(pitch, line, event);
        notes = [note];
        previousNote = note;
      } else if (event.degree === null && event.notes.length) {
        const shift = transpose + octaveShift;
        const used = new Set<number>();
        for (const original of event.notes) {
          const pitch = midi(tunings[source.instrument][original.string - 1]) + original.fret + (source.capo ?? 0) + shift;
          const note = source.instrument === instrument && shift === 0 && (source.capo ?? 0) === 0 ? {
            ...original,
            tie: false,
            slide: 'none' as const
          } : playablePosition(pitch, line, event);
          if (!note || used.has(note.string)) throw new Error(`「${line.label}」的原谱同时音无法完整映射到目标乐器，请手动选择可弹指型`);
          used.add(note.string);
          notes.push(note);
          previousNote = note;
        }
      } else if (event.degree === null && !event.notes.length) throw new Error(`「${line.label}」包含尚未确认的音符；请录入数字音级、弦品或明确休止符 0`);
      if (fingerstyle && event.tie) {
        const previousPitches = previousSourceNotes.map(note => midi(tunings[instrument][note.string - 1]) + note.fret);
        notes = notes.map(note => {
          const pitch = midi(tunings[instrument][note.string - 1]) + note.fret;
          const previous = previousSourceNotes.find(n => midi(tunings[instrument][n.string - 1]) + n.fret === pitch);
          if (!previous || !previousPitches.includes(pitch)) throw new Error('原谱延音未承接相同音高，请先校对延音标记');
          return {
            ...previous,
            tie: true
          };
        });
      }
      previousSourceNotes = notes;
      let remaining = (event.dotted ? 288 : 192) / (event.duration ?? options.fallbackDuration) * (event.tuplet === 3 ? 2 / 3 : 1);
      let first = true;
      while (remaining > 0) {
        if (!current) current = begin(n, d);
        const used = current!.measure.beats.reduce((sum, beat) => sum + beatTicks(beat), 0);
        const capacity = 192 * n / d;
        if (used >= capacity) {
          current = null;
          continue;
        }
        const ticks = Math.min(remaining, capacity - used);
        const fragments = ticks === remaining && first ? [{
          duration: event.duration ?? options.fallbackDuration,
          dotted: event.dotted,
          tuplet: event.tuplet ?? undefined,
          ticks
        }] : splitRhythm(ticks);
        for (const fragment of fragments) {
          const fragmentNotes = notes.map(note => ({
            ...note,
            tie: note.tie || !first
          }));
          const lyric = event.lyric || (index === 0 && line.events.every(item => !item.lyric) ? line.lyrics : '');
          if (lyric.length > 100) throw new Error('小节歌词超过基础谱单拍文本长度，请先分配到多个事件');
          append(newBeat(fragment.duration, fragment.dotted, fragmentNotes, first && lyric ? [lyric] : [], first && chordName !== undefined ? activeChord : null, fragment.tuplet), activeChord);
          first = false;
        }
        remaining -= ticks;
        if (remaining) current = null;
      }
    }
    const trailing = changes.get(line.events.length);
    if (trailing !== undefined) activeChord = resolveChord(trailing);
  }
  if (!timed.length) throw new Error('共同旋律没有可编配的事件');
  const measures = fingerstyle ? timed.map(({
    measure,
    events
  }) => {
    let ticks = 0;
    events.forEach(({
      beat,
      chord
    }) => {
      if (ticks % 48 === 0 && chord && beat.notes.length && !beat.notes.some(note => note.tie)) {
        const usedStrings = new Set(beat.notes.map(note => note.string));
        const bass = chord.frets.flatMap((fret, index) => fret < 0 || usedStrings.has(index + 1) ? [] : [{
          string: index + 1,
          fret,
          tie: false,
          slide: 'none' as const
        }]).filter(note => midi(tunings[instrument][note.string - 1]) + note.fret < Math.min(...beat.notes.map(melody => midi(tunings[instrument][melody.string - 1]) + melody.fret))).sort((a, b) => midi(tunings[instrument][a.string - 1]) + a.fret - (midi(tunings[instrument][b.string - 1]) + b.fret));
        const candidate = bass.find(note => {
          const fretted = [...beat.notes, note].filter(n => n.fret > 0).map(n => n.fret);
          return !fretted.length || Math.max(...fretted) - Math.min(...fretted) <= 4;
        });
        if (candidate) beat.notes.push(candidate);
      }
      ticks += beatTicks(beat);
    });
    return measure;
  }) : timed.map(({
    measure,
    events,
    numerator: n,
    denominator: d
  }) => {
    const positions = new Map<number, TimedBeat>();
    let tick = 0;
    events.forEach(event => {
      positions.set(tick, event);
      tick += beatTicks(event.beat);
    });
    const end = tick;
    const boundaries = new Set<number>([0, end]);
    for (let grid = 0; grid < end; grid += 24) boundaries.add(grid);
    for (const [at, event] of positions) if (event.beat.lyrics.length || event.beat.chord) boundaries.add(at);
    const ordered = [...boundaries].sort((a, b) => a - b);
    const beats: Beat[] = [];
    let chord = events[0]?.chord ?? null;
    let pattern = 0;
    for (let index = 0; index < ordered.length - 1; index++) {
      const at = ordered[index];
      for (const [position, event] of positions) if (position <= at) chord = event.chord;
      const origin = positions.get(at);
      const strings = chord?.frets.flatMap((fret, i) => fret < 0 ? [] : [{
        string: i + 1,
        fret,
        tie: false,
        slide: 'none' as const
      }]).sort((a, b) => midi(tunings[instrument][a.string - 1]) + a.fret - (midi(tunings[instrument][b.string - 1]) + b.fret)) ?? [];
      const note = at % 24 === 0 && strings.length ? strings[pattern++ % strings.length] : null;
      const fragments = splitRhythm(ordered[index + 1] - at);
      fragments.forEach((fragment, part) => beats.push(newBeat(fragment.duration, fragment.dotted, note ? [{
        ...note,
        tie: part > 0
      }] : [], part === 0 ? origin?.beat.lyrics ?? [] : [], part === 0 ? origin?.beat.chord ?? null : null, fragment.tuplet)));
    }
    if (beats.length > 128 || beats.reduce((sum, beat) => sum + beatTicks(beat), 0) > 192 * n / d) throw new Error('伴奏小节超出基础谱容量，请减少节奏细分');
    return {
      ...measure,
      beats
    };
  });
  if (!source.lines.some(line => line.chordChanges.length)) summary.add('共同旋律源未录入和弦变化；练习版保留旋律或空伴奏，需要手动补和弦。');
  if (suggestedChords.size) summary.add(`${suggestedChords.size} 种和弦使用目标调性下的常规或按音级生成的指型建议；斜杠和弦保留指定最低音，扩展和弦可省略五音，需按手型确认。`);
  if (unknownChords.size) summary.add(`${unknownChords.size} 种和弦尚无可靠映射（${[...unknownChords].slice(0, 8).join('、')}${unknownChords.size > 8 ? '等' : ''}），对应位置保留空伴奏，不猜配音。`);
  if (confirmedFingeringRelocated) summary.add('已确认的数字谱弦品随目标乐器、调性、音区或变调夹重新定位，完整保留同时音；新位置为需校对的练习建议，原谱指型保持不变。');
  if (foldedNotes.size) {
    const count = [...foldedNotes.values()].reduce((sum, record) => sum + record.count, 0);
    summary.add(`无法全曲统一移八度，${count} 个超音域音按最近八度折回，可能改变旋律走向；仅为可修改的练习建议，原谱保留。`);
    for (const [label, record] of [...foldedNotes].slice(0, 8)) summary.add(`${label}：${record.count} 个音折回（${[...record.examples].slice(0, 3).join('；')}）。`);
    if (foldedNotes.size > 8) summary.add(`另有 ${foldedNotes.size - 8} 个小节含八度折回建议。`);
  }
  summary.add(fingerstyle ? '指弹版保留共同旋律，并在整拍上尝试叠加手型跨度不超过 4 品的低音；编配与弦品为练习建议。' : '伴奏版在共同歌词与时值轴上采用固定八分分解拨弦；此模式为练习建议，未恢复原谱扫弦节奏。');
  summary.add('右手通用建议：吉他 P 拨 4–6 弦、i/m/a 分别拨 3/2/1 弦；尤克里里可用 P 拨低声部、i/m/a 拨其余弦。原图未给出的指法需按手型确认。');
  const score: EditableScore = {
    kind: 'editable',
    instrument,
    tempo: options.tempo,
    numerator,
    denominator,
    capo: 0,
    measures,
    arrangement: {
      scenario,
      sourceId: source.id,
      sourceIds: [source.id],
      originSongId: doc.id,
      key: options.key.trim(),
      summary: [...summary],
      suggested: true
    }
  };
  const now = new Date().toISOString();
  const label = `${instrument === 'guitar' ? '吉他' : '尤克里里'}${fingerstyle ? '指弹' : '伴奏'}`;
  return validateDocument({
    ...doc,
    id: crypto.randomUUID(),
    title: `${doc.title} · ${label}练习版`,
    createdAt: now,
    updatedAt: now,
    score,
    practice: defaultPractice(measures.length)
  });
}
