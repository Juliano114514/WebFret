import { measureLength, tunings, type Beat, type WebFretDocument } from './model';

// Emit literals, never concatenate user text as alphaTex commands.
export function texString(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
}
function beatTex(beat: Beat, chordId: string | null): string {
  const notes = beat.notes.map((n) => {
    const effects: string[] = [];
    if (n.slide !== 'none') effects.push(n.slide === 'legato' ? 'sl' : 'ss');
    return `${n.tie ? '-' : n.fret}.${n.string}${effects.length ? '{' + effects.join(' ') + '}' : ''}`;
  });
  const effects: string[] = [];
  if (beat.dotted) effects.push('d');
  if (beat.brush !== 'none' && notes.length > 1) effects.push(beat.brush === 'down' ? 'bd' : 'bu');
  if (chordId) effects.push('ch ' + texString(chordId));
  beat.lyrics.forEach((text, i) => {
    if (text) effects.push(`lyrics ${i} ${texString(text)}`);
  });
  const content =
    notes.length === 0 ? 'r' : notes.length === 1 ? notes[0] : '(' + notes.join(' ') + ')';
  return `:${beat.duration} ${content}${effects.length ? '{' + effects.join(' ') + '}' : ''}`;
}
export function compileAlphaTex(doc: WebFretDocument): string {
  if (doc.score.kind !== 'editable') throw new Error('GP 文件不使用基础谱编译器');
  const s = doc.score;
  const chords = new Map<string, { name: string; frets: number[] }>();
  const chordIds = new Map<string, string>();
  s.measures.forEach((m) =>
    m.beats.forEach((b) => {
      if (b.chord) {
        const key = JSON.stringify(b.chord);
        let id = chordIds.get(key);
        if (!id) {
          id = b.chord.name;
          while (chords.has(id)) id += ' ';
          chordIds.set(key, id);
          chords.set(id, b.chord);
        }
      }
    }),
  );
  const lines = [
    `\\title ${texString(doc.title)}`,
    `\\artist ${texString(doc.artist)}`,
    `\\tempo ${s.tempo}`,
    `\\track ${texString(s.instrument === 'guitar' ? '吉他' : '尤克里里')}`,
    '\\staff{tabs}',
    '\\instrument 25',
    `\\tuning ${tunings[s.instrument].join(' ')}`,
    `\\capo ${s.capo}`,
  ];
  chords.forEach((chord, id) =>
    lines.push(`\\chord (${texString(id)} ${chord.frets.map((n) => (n < 0 ? 'x' : n)).join(' ')})`),
  );
  lines.push(`\\ts ${s.numerator} ${s.denominator}`);
  s.measures.forEach((m, i) => {
    let remaining = s.numerator / s.denominator - measureLength(m);
    if (remaining < -0.00001) throw new Error(`第 ${i + 1} 小节时值超过拍号容量`);
    const contents = m.beats.map((b) =>
      beatTex(b, b.chord ? chordIds.get(JSON.stringify(b.chord))! : null),
    );
    for (const duration of [1, 2, 4, 8, 16, 32, 64] as const) {
      while (remaining + 0.00001 >= 1 / duration) {
        contents.push(`:${duration} r`);
        remaining -= 1 / duration;
      }
    }
    if (remaining > 0.00001) throw new Error('剩余时值不能表示为基础休止符');
    lines.push(contents.join(' ') + (i < s.measures.length - 1 ? ' |' : ''));
  });
  return lines.join('\n');
}
