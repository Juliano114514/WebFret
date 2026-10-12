import { useState } from 'react';
import { ChordDiagram, Icon, NumberField } from './components';
import {
  chordPresets,
  emptyBeat,
  emptyMeasure,
  instrumentNames,
  measureLength,
  notesForChord,
  tunings,
  type Beat,
  type Chord,
  type Duration,
  type EditableScore,
  type Instrument,
  type Measure,
  type WebFretDocument,
} from './model';

interface Props {
  doc: WebFretDocument;
  barIndex: number;
  beatIndex: number;
  select: (bar: number, beat: number) => void;
  change: (doc: WebFretDocument) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  notify: (message: string) => void;
}
export default function Editor({
  doc,
  barIndex,
  beatIndex,
  select,
  change,
  undo,
  redo,
  canUndo,
  canRedo,
  notify,
}: Props) {
  const [clipboard, setClipboard] = useState<Measure | null>(null);
  const [customName, setCustomName] = useState('');
  const [customFrets, setCustomFrets] = useState('');
  if (doc.score.kind !== 'editable') return null;
  const score = doc.score;
  const measure = score.measures[Math.min(barIndex, score.measures.length - 1)];
  const beat = measure.beats[Math.min(beatIndex, measure.beats.length - 1)];
  function mutate(update: (draft: EditableScore) => void) {
    const next = structuredClone(doc);
    if (next.score.kind !== 'editable') return;
    update(next.score);
    change(next);
  }
  function updateBeat(update: (draft: Beat) => void) {
    mutate((s) => update(s.measures[barIndex].beats[beatIndex]));
  }
  function applyChord(chord: Chord, withNotes: boolean) {
    updateBeat((b) => {
      b.chord = structuredClone(chord);
      if (withNotes) b.notes = notesForChord(chord);
    });
  }
  function customChord(withNotes: boolean) {
    const tokens = customFrets.trim().split(/[,，\s]+/);
    const frets = tokens.map((x) =>
      /^(x|X|×|-1)$/.test(x) ? -1 : /^\d{1,2}$/.test(x) ? Number(x) : NaN,
    );
    if (
      !customName.trim() ||
      customName.length > 40 ||
      frets.length !== tunings[score.instrument].length ||
      frets.some((n) => !Number.isInteger(n) || n < -1 || n > 24)
    ) {
      notify('填写和弦名与每根弦的品位，用逗号分隔；不弹的弦填 x');
      return;
    }
    applyChord({ name: customName.trim(), frets }, withNotes);
  }
  function copyMeasure(source: Measure): Measure {
    const result = structuredClone(source);
    result.id = crypto.randomUUID();
    result.beats.forEach((b) => (b.id = crypto.randomUUID()));
    return result;
  }
  return (
    <section className="editor-panel">
      <header className="panel-heading">
        <div>
          <span className="eyebrow">COMPOSE</span>
          <h2>基础制谱</h2>
        </div>
        <div className="row">
          <button
            className="icon-btn"
            title="撤销"
            aria-label="撤销"
            disabled={!canUndo}
            onClick={undo}
          >
            <Icon name="undo" />
          </button>
          <button
            className="icon-btn"
            title="重做"
            aria-label="重做"
            disabled={!canRedo}
            onClick={redo}
          >
            <Icon name="redo" />
          </button>
        </div>
      </header>
      <div className="editor-meta">
        <label>
          曲名
          <input
            value={doc.title}
            maxLength={200}
            onChange={(e) => change({ ...doc, title: e.target.value })}
          />
        </label>
        <label>
          作者
          <input
            value={doc.artist}
            maxLength={200}
            placeholder="你的名字"
            onChange={(e) => change({ ...doc, artist: e.target.value })}
          />
        </label>
        <label>
          乐器
          <select
            value={score.instrument}
            onChange={(e) => {
              const instrument = e.target.value as Instrument;
              if (
                score.measures.some((m) =>
                  m.beats.some(
                    (b) =>
                      b.notes.some((n) => n.string > tunings[instrument].length) ||
                      (b.chord && b.chord.frets.length !== tunings[instrument].length),
                  ),
                )
              ) {
                notify('已有音符或和弦的弦数与目标乐器不符，请先清除这些内容');
                return;
              }
              mutate((s) => {
                s.instrument = instrument;
              });
            }}
          >
            {Object.entries(instrumentNames).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid three">
          <label>
            BPM
            <NumberField
              min={20}
              max={300}
              value={score.tempo}
              onValue={(n) => mutate((s) => (s.tempo = n))}
              onInvalid={() => notify('BPM 请输入 20—300 之间的整数')}
            />
          </label>
          <label>
            拍号
            <select
              value={`${score.numerator}/${score.denominator}`}
              onChange={(e) => {
                const [n, d] = e.target.value.split('/').map(Number);
                mutate((s) => {
                  for (const m of s.measures) {
                    const empty = m.beats.every(
                      (b) => !b.notes.length && !b.chord && !b.lyrics.some(Boolean),
                    );
                    if (empty && measureLength(m) > n / d)
                      m.beats = emptyMeasure(n, d as Duration).beats;
                  }
                  s.numerator = n;
                  s.denominator = d as 2 | 4 | 8;
                });
                select(barIndex, 0);
              }}
            >
              {['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            变调夹
            <NumberField
              min={0}
              max={12}
              value={score.capo}
              onValue={(n) => mutate((s) => (s.capo = n))}
              onInvalid={() => notify('变调夹位置请输入 0—12')}
            />
          </label>
        </div>
      </div>
      <div className="editor-section">
        <div className="section-label">
          <h3>小节</h3>
          <span>{score.measures.length} 小节</span>
        </div>
        <div className="measure-picker">
          {score.measures.map((m, i) => (
            <button
              key={m.id}
              className={i === barIndex ? 'selected' : ''}
              onClick={() => select(i, 0)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="row wrap measure-actions">
          <button
            className="text-btn"
            onClick={() => {
              mutate((s) =>
                s.measures.splice(barIndex + 1, 0, emptyMeasure(s.numerator, s.denominator)),
              );
              select(barIndex + 1, 0);
            }}
          >
            <Icon name="plus" size={15} />
            添加
          </button>
          <button
            className="text-btn"
            onClick={() => {
              setClipboard(structuredClone(measure));
              notify('已复制当前小节');
            }}
          >
            <Icon name="copy" size={15} />
            复制
          </button>
          <button
            className="text-btn"
            disabled={!clipboard}
            onClick={() => {
              if (clipboard) {
                mutate((s) => (s.measures[barIndex] = copyMeasure(clipboard)));
                select(barIndex, 0);
              }
            }}
          >
            粘贴替换
          </button>
          <button
            className="text-btn danger"
            disabled={score.measures.length <= 1}
            onClick={() => {
              mutate((s) => s.measures.splice(barIndex, 1));
              select(Math.max(0, barIndex - 1), 0);
            }}
          >
            <Icon name="trash" size={15} />
            删除
          </button>
        </div>
      </div>
      <div className="editor-section">
        <div className="section-label">
          <h3>
            第 {barIndex + 1} 小节 · 拍点 {beatIndex + 1}
          </h3>
          <span>
            {Math.round(measureLength(measure) * (measure.denominator ?? score.denominator) * 100) / 100} / {measure.numerator ?? score.numerator}{' '}
            拍
          </span>
        </div>
        <div className="beat-picker">
          {measure.beats.map((b, i) => (
            <button
              key={b.id}
              className={i === beatIndex ? 'selected' : ''}
              onClick={() => select(barIndex, i)}
            >
              <span>{i + 1}</span>
              <small>{b.notes.length ? b.chord?.name || '音符' : '休止'}</small>
            </button>
          ))}
        </div>
        <div className="row wrap measure-actions">
          <button
            className="text-btn"
            onClick={() =>
              mutate((s) => s.measures[barIndex].beats.splice(beatIndex + 1, 0, emptyBeat(8)))
            }
          >
            <Icon name="plus" size={15} />
            插入八分拍点
          </button>
          <button
            className="text-btn danger"
            disabled={measure.beats.length <= 1}
            onClick={() => {
              mutate((s) => s.measures[barIndex].beats.splice(beatIndex, 1));
              select(barIndex, Math.max(0, beatIndex - 1));
            }}
          >
            删除拍点
          </button>
          <button
            className="text-btn"
            onClick={() =>
              updateBeat((b) => {
                b.notes = [];
                b.brush = 'none';
                b.chord = null;
              })
            }
          >
            改为休止
          </button>
        </div>
        <div className="field-grid">
          <label>
            音符时值
            <select
              value={beat.duration}
              onChange={(e) => updateBeat((b) => (b.duration = Number(e.target.value) as Duration))}
            >
              {[
                [1, '全音符'],
                [2, '二分音符'],
                [4, '四分音符'],
                [8, '八分音符'],
                [16, '十六分音符'],
                [32, '三十二分音符'],
              ].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            扫弦
            <select
              value={beat.brush}
              onChange={(e) => updateBeat((b) => (b.brush = e.target.value as Beat['brush']))}
            >
              <option value="none">不扫弦</option>
              <option value="down">↓ 向下扫弦</option>
              <option value="up">↑ 向上扫弦</option>
            </select>
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={beat.dotted}
            onChange={(e) => updateBeat((b) => (b.dotted = e.target.checked))}
          />
          附点（增加一半时值）
        </label>
        <div className="fret-grid">
          <div className="fret-header">
            <span>弦 / 调弦</span>
            <span>品位</span>
            <span>延音</span>
            <span>滑音</span>
          </div>
          {tunings[score.instrument].map((tuning, i) => {
            const note = beat.notes.find((n) => n.string === i + 1);
            return (
              <div className="fret-row" key={tuning + i}>
                <span>
                  <b>{i + 1}</b> {tuning}
                </span>
                <input
                  aria-label={`第 ${i + 1} 弦品位`}
                  type="number"
                  min={0}
                  max={24}
                  placeholder="—"
                  value={note?.fret ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    const fret = Number(value);
                    if (value !== '' && (!Number.isInteger(fret) || fret < 0 || fret > 24)) return;
                    updateBeat((b) => {
                      b.notes = b.notes.filter((n) => n.string !== i + 1);
                      if (value !== '')
                        b.notes.push({ string: i + 1, fret, tie: false, slide: 'none' });
                      b.notes.sort((a, b) => a.string - b.string);
                    });
                  }}
                />
                <input
                  aria-label={`第 ${i + 1} 弦延音`}
                  type="checkbox"
                  disabled={!note}
                  checked={note?.tie ?? false}
                  onChange={(e) =>
                    updateBeat((b) => {
                      const n = b.notes.find((n) => n.string === i + 1);
                      if (n) n.tie = e.target.checked;
                    })
                  }
                />
                <select
                  aria-label={`第 ${i + 1} 弦滑音`}
                  disabled={!note}
                  value={note?.slide ?? 'none'}
                  onChange={(e) =>
                    updateBeat((b) => {
                      const n = b.notes.find((n) => n.string === i + 1);
                      if (n) n.slide = e.target.value as typeof n.slide;
                    })
                  }
                >
                  <option value="none">无</option>
                  <option value="shift">换把</option>
                  <option value="legato">连奏</option>
                </select>
              </div>
            );
          })}
        </div>
        <p className="helper">留空表示不弹。延音承接前一同弦音符；滑音连接后续同弦音符。</p>
      </div>
      <div className="editor-section">
        <div className="section-label">
          <h3>和弦指型</h3>
          {beat.chord && (
            <button className="text-btn" onClick={() => updateBeat((b) => (b.chord = null))}>
              清除标注
            </button>
          )}
        </div>
        <div className="chord-options">
          {chordPresets[score.instrument === 'guitar' ? 'guitar' : 'ukulele'].map((c) => (
            <button
              key={c.name}
              title={`填入 ${c.name} 指型与音符`}
              onClick={() => applyChord(c, true)}
            >
              <ChordDiagram chord={c} />
            </button>
          ))}
        </div>
        <p className="helper">点选指型会填入实际音符。仅标注不会产生声音。</p>
        <div className="field-grid">
          <label>
            自定义和弦
            <input
              value={customName}
              maxLength={40}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="例如 Cadd9"
            />
          </label>
          <label>
            第 1 弦 → 第 {tunings[score.instrument].length} 弦
            <input
              value={customFrets}
              onChange={(e) => setCustomFrets(e.target.value)}
              placeholder={score.instrument === 'guitar' ? '0, 1, 0, 2, 3, x' : '3, 0, 0, 0'}
            />
          </label>
        </div>
        <div className="row">
          <button className="small-btn" onClick={() => customChord(true)}>
            填入指型与音符
          </button>
          <button className="small-btn" onClick={() => customChord(false)}>
            仅标注
          </button>
        </div>
      </div>
      <div className="editor-section">
        <div className="section-label">
          <h3>当前拍点歌词</h3>
          <span>最多 4 行</span>
        </div>
        <textarea
          rows={3}
          value={beat.lyrics.join('\n')}
          maxLength={400}
          placeholder={'同拍可以写多个汉字\n换行添加第二段歌词'}
          onChange={(e) => updateBeat((b) => (b.lyrics = e.target.value.split('\n').slice(0, 4)))}
        />
        <p className="helper">歌词跟随拍点显示在谱下方。空行保留对应的歌词行。</p>
      </div>
    </section>
  );
}
