import { useEffect, useRef, useState } from 'react';
import { Icon, Modal, NumberField } from './components';
import Editor from './Editor';
import { download, exportDocument } from './files';
import {
  instrumentNames,
  measureCount,
  validateDocument,
  type PracticeSettings,
  type TrackMix,
  type WebFretDocument,
} from './model';
import { ScoreEngine, type EngineState } from './ScoreEngine';

interface Props {
  initial: WebFretDocument;
  repo: boolean;
  editing: boolean;
  back: () => void;
  toggleEdit: () => void;
  copy: (doc: WebFretDocument, edit: boolean) => Promise<void>;
  save: (doc: WebFretDocument) => Promise<void>;
  notify: (message: string) => void;
}
const initialEngineState: EngineState = {
  ready: false,
  rendering: true,
  playing: false,
  bar: 1,
  beat: 1,
  currentTime: 0,
  totalTime: 0,
  tracks: [],
  lyrics: [],
  error: null,
};
function time(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function Song({
  initial,
  repo,
  editing,
  back,
  toggleEdit,
  copy,
  save,
  notify,
}: Props) {
  const [doc, setDoc] = useState(initial);
  const [state, setState] = useState(initialEngineState);
  const [segmentMode, setSegmentMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [barIndex, setBarIndex] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const [saveState, setSaveState] = useState('saved');
  const [segmentDialog, setSegmentDialog] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [past, setPast] = useState<WebFretDocument[]>([]);
  const [future, setFuture] = useState<WebFretDocument[]>([]);
  const [exportMenu, setExportMenu] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<ScoreEngine | null>(null);
  const editRef = useRef(editing);
  editRef.current = editing;
  const revision = useRef(0);
  const count = measureCount(doc);
  const p = doc.practice;
  useEffect(() => {
    if (!container.current) return;
    const instance = new ScoreEngine(container.current, setState, (bar, beat) => {
      if (editRef.current) {
        setBarIndex(bar);
        setBeatIndex(beat);
      }
    });
    engine.current = instance;
    return () => {
      engine.current = null;
      instance.destroy();
    };
  }, []);
  useEffect(() => {
    const handle = setTimeout(() => engine.current?.load(doc), 180);
    return () => clearTimeout(handle);
  }, [doc.score, doc.title, doc.artist]);
  useEffect(() => {
    engine.current?.configure(p, segmentMode);
  }, [p, segmentMode, state.tracks]);
  useEffect(() => {
    if (repo) return;
    const current = ++revision.current;
    setSaveState('saving');
    void save(doc)
      .then(() => {
        if (revision.current === current) setSaveState('saved');
      })
      .catch(() => {
        if (revision.current === current) setSaveState('error');
      });
  }, [doc, repo, save]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState !== 'saved' && !repo) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState, repo]);
  function normalize(next: WebFretDocument): WebFretDocument {
    const n = measureCount(next);
    next.practice.start = Math.min(n, next.practice.start);
    next.practice.end = Math.max(next.practice.start, Math.min(n, next.practice.end));
    next.practice.segments = next.practice.segments
      .filter((s) => s.start <= n)
      .map((s) => ({ ...s, end: Math.min(s.end, n) }));
    next.updatedAt = new Date().toISOString();
    return validateDocument(next);
  }
  function commit(next: WebFretDocument, history = true): void {
    try {
      const valid = normalize(next);
      // Practice controls must not reload the score or interrupt ongoing playback.
      if (next.score === doc.score) valid.score = doc.score;
      if (history) {
        setPast((items) => [...items.slice(-79), structuredClone(doc)]);
        setFuture([]);
      }
      setDoc(valid);
    } catch (error) {
      notify(error instanceof Error ? error.message : '曲谱修改无效');
    }
  }
  function practice(patch: Partial<PracticeSettings>): void {
    commit({ ...doc, practice: { ...p, ...patch } }, false);
  }
  function select(bar: number, beat: number): void {
    if (doc.score.kind === 'editable') {
      bar = Math.min(Math.max(0, bar), doc.score.measures.length - 1);
      beat = Math.min(Math.max(0, beat), doc.score.measures[bar].beats.length - 1);
    }
    setBarIndex(bar);
    setBeatIndex(beat);
  }
  function moveBlock(direction: number): void {
    const start = Math.max(1, Math.min(count, p.start + direction * p.blockSize));
    practice({ start, end: Math.min(count, start + p.blockSize - 1) });
  }
  function updateMix(index: number, patch: Partial<TrackMix>): void {
    const mix = p.trackMix[String(index)] ?? { volume: 1, muted: false, solo: false };
    practice({ trackMix: { ...p.trackMix, [String(index)]: { ...mix, ...patch } } });
  }
  function exportGp(): void {
    try {
      const bytes = engine.current?.exportGp();
      if (bytes) {
        download(doc.title + '.gp', bytes.slice().buffer, 'application/octet-stream');
        notify('已导出 GP7；排版与扩展音效以 alphaTab 支持范围为准');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'GP 导出失败');
    }
  }
  return (
    <>
      <div className="song-topbar">
        <button className="text-btn" onClick={back}>
          <Icon name="back" size={18} />
          返回曲库
        </button>
        <div className="save-state">
          {repo ? (
            <>
              <Icon name="book" size={15} />
              仓库曲目
            </>
          ) : saveState === 'saved' ? (
            <>
              <Icon name="check" size={15} />
              已保存到本机
            </>
          ) : saveState === 'saving' ? (
            '正在保存…'
          ) : (
            <button
              className="text-btn danger"
              onClick={() => {
                setDoc({ ...doc });
              }}
            >
              保存失败 · 点击重试
            </button>
          )}
        </div>
      </div>
      <header className="song-heading">
        <div>
          <span className="eyebrow">{editing ? 'MAKE IT YOURS' : 'ONE MEASURE AT A TIME'}</span>
          <h1>{doc.title || '未命名练习曲'}</h1>
          <p>
            {doc.artist || '我的创作'} <span>·</span> {instrumentNames[doc.score.instrument]}{' '}
            <span>·</span> {count} 小节
          </p>
        </div>
        <div className="row wrap">
          {repo && (
            <button className="button secondary" onClick={() => void copy(doc, false)}>
              <Icon name="plus" size={17} />
              收藏到本机
            </button>
          )}
          {doc.score.kind === 'editable' && (
            <button
              className="button secondary"
              onClick={() => {
                if (repo) void copy(doc, true);
                else toggleEdit();
              }}
            >
              <Icon name={editing ? 'book' : 'edit'} size={17} />
              {editing ? '回到读谱' : repo ? '复制并编辑' : '编辑曲谱'}
            </button>
          )}
          <div className="dropdown">
            <button
              className="button secondary"
              onClick={() => setExportMenu(!exportMenu)}
              aria-expanded={exportMenu}
            >
              <Icon name="download" size={17} />
              导出
            </button>
            {exportMenu && (
              <div className="dropdown-menu">
                <button
                  onClick={() => {
                    exportDocument(doc);
                    setExportMenu(false);
                  }}
                >
                  WebFret 曲目文件
                </button>
                <button
                  disabled={!state.ready}
                  onClick={() => {
                    exportGp();
                    setExportMenu(false);
                  }}
                >
                  Guitar Pro 7 (.gp)
                </button>
                {doc.score.kind === 'guitar-pro' && (
                  <button
                    onClick={() => {
                      if (doc.score.kind === 'guitar-pro') {
                        const raw = Uint8Array.from(atob(doc.score.base64), (c) => c.charCodeAt(0));
                        download(doc.score.originalName, raw.buffer, 'application/octet-stream');
                      }
                      setExportMenu(false);
                    }}
                  >
                    原始 GP 文件
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {doc.score.kind === 'editable' && doc.score.arrangement && <div className="source-intro"><Icon name="music" size={20} /><div><b>练习编配建议 · {doc.score.arrangement.key} 调</b><p>{doc.score.arrangement.summary[0]}</p>{doc.score.arrangement.summary.filter((s) => /八度|音区/.test(s)).map((s, i) => <p className="review-note" key={i}>{s}</p>)}<details><summary>查看节奏、指型与来源说明</summary>{doc.score.arrangement.summary.slice(1).map((s, i) => <p key={i}>{s}</p>)}<p className="helper">此副本可以修改。共同原谱仍保留；导出 GP 主要保存声音与谱面，建议来源请用 WebFret 文件保管。</p></details></div></div>}
      <div className={`workspace ${editing ? 'is-editing' : ''}`}>
        <div className="score-column">
          <section className="score-card">
            <div className="score-toolbar">
              <div className="row">
                <span className="paper-dot" />
                <b>{segmentMode ? `专注第 ${p.start}—${p.end} 小节` : '完整曲谱'}</b>
                {doc.score.kind === 'guitar-pro' && <span className="pill">GP · 只读</span>}
              </div>
              <label className="zoom-control">
                缩放
                <select
                  aria-label="谱面缩放"
                  value={zoom}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setZoom(value);
                    engine.current?.zoom(value);
                  }}
                >
                  {[0.75, 1, 1.25, 1.5].map((v) => (
                    <option key={v} value={v}>
                      {Math.round(v * 100)}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="score-scroll">
              <div className="paper-heading">
                <h2>{doc.title || '未命名练习曲'}</h2>
                <p>{doc.artist || '我的创作'}</p>
                <div className="paper-details">
                  <span>♩ = {doc.score.kind === 'source' ? '未知' : doc.score.tempo}</span>
                  {doc.score.kind === 'editable' && (
                    <>
                      <span>
                        {doc.score.numerator}/{doc.score.denominator}
                      </span>
                      <span>Capo {doc.score.capo}</span>
                    </>
                  )}
                  <span>{instrumentNames[doc.score.instrument]}</span>
                </div>
              </div>
              {state.error && (
                <div className="inline-error" role="alert">
                  {state.error}
                  <button className="text-btn" onClick={() => engine.current?.load(doc)}>
                    重试
                  </button>
                </div>
              )}
              {state.rendering && (
                <div className="render-status">
                  <span className="spinner" />
                  正在排版曲谱…
                </div>
              )}
              <div className="notation-wrap">
                <div ref={container} className="notation" />
                <div className="lyrics-overlay">
                  {state.lyrics.map((lyric) => (
                    <span
                      key={lyric.key}
                      title={lyric.text}
                      style={{
                        left: lyric.x,
                        top: lyric.y,
                        maxWidth: lyric.width,
                        fontSize: 12 * zoom,
                      }}
                    >
                      {lyric.text}
                    </span>
                  ))}
                </div>
              </div>
              <div className="paper-footer">
                {editing
                  ? '点击谱面上的拍点，也可以在右侧面板选择并编辑。'
                  : segmentMode
                    ? '放慢一点，把这一小段弹熟。'
                    : '点击拍点定位播放 · 跟随光标练习'}
              </div>
            </div>
          </section>
          {doc.score.kind === 'guitar-pro' && (
            <section className="track-panel">
              <div className="section-label">
                <h3>音轨</h3>
                <span className="muted">选择显示音轨，独奏或静音伴奏</span>
              </div>
              {state.tracks.map((track) => {
                const mix = p.trackMix[String(track.index)] ?? {
                  volume: 1,
                  muted: false,
                  solo: false,
                };
                return (
                  <div className="track-row" key={track.index}>
                    <button
                      className={`small-btn ${p.selectedTrack === track.index ? 'selected' : ''}`}
                      onClick={() => practice({ selectedTrack: track.index })}
                    >
                      {track.index + 1}. {track.name}
                    </button>
                    <button
                      className={`mix-btn ${mix.solo ? 'active' : ''}`}
                      aria-label={`${track.name} 独奏`}
                      aria-pressed={mix.solo}
                      onClick={() => updateMix(track.index, { solo: !mix.solo })}
                    >
                      S
                    </button>
                    <button
                      className={`mix-btn ${mix.muted ? 'active' : ''}`}
                      aria-label={`${track.name} 静音`}
                      aria-pressed={mix.muted}
                      onClick={() => updateMix(track.index, { muted: !mix.muted })}
                    >
                      M
                    </button>
                    <input
                      type="range"
                      aria-label={`${track.name} 音量`}
                      min={0}
                      max={1}
                      step={0.05}
                      value={mix.volume}
                      onChange={(e) => updateMix(track.index, { volume: Number(e.target.value) })}
                    />
                  </div>
                );
              })}
            </section>
          )}
          {repo && (
            <p className="source-note">
              <Icon name="book" size={15} />
              收藏到本机后，练习设置会自动保存。仓库作品通过导出文件提交 GitHub 维护。
            </p>
          )}
        </div>
        {editing ? (
          <Editor
            doc={doc}
            barIndex={barIndex}
            beatIndex={beatIndex}
            select={select}
            change={(next) => commit(next)}
            undo={() => {
              const previous = past.at(-1);
              if (previous) {
                setFuture((items) => [structuredClone(doc), ...items]);
                setPast((items) => items.slice(0, -1));
                commit({ ...previous, practice: p }, false);
                select(0, 0);
              }
            }}
            redo={() => {
              const next = future[0];
              if (next) {
                setPast((items) => [...items, structuredClone(doc)]);
                setFuture((items) => items.slice(1));
                commit({ ...next, practice: p }, false);
                select(0, 0);
              }
            }}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            notify={notify}
          />
        ) : (
          <aside className="practice-panel">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">LESS, BUT BETTER</span>
                <h2>专注练习</h2>
              </div>
              <span className="practice-symbol">
                <Icon name="repeat" size={25} />
              </span>
            </header>
            <div className="mode-switch">
              <button
                className={!segmentMode ? 'active' : ''}
                onClick={() => setSegmentMode(false)}
              >
                整曲播放
              </button>
              <button className={segmentMode ? 'active' : ''} onClick={() => setSegmentMode(true)}>
                分块练习
              </button>
            </div>
            <div className={`practice-section ${!segmentMode ? 'soft-disabled' : ''}`}>
              <div className="section-label">
                <h3>每次专注</h3>
                <span>小节</span>
              </div>
              <div className="block-options">
                {[1, 2, 4, 8].map((n) => (
                  <button
                    key={n}
                    className={p.blockSize === n ? 'selected' : ''}
                    onClick={() => {
                      setSegmentMode(true);
                      practice({ blockSize: n, end: Math.min(count, p.start + n - 1) });
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="range-fields">
                <label>
                  开始小节
                  <NumberField
                    label="开始小节"
                    min={1}
                    max={count}
                    value={p.start}
                    onValue={(n) =>
                      practice({ start: n, end: Math.min(count, Math.max(n, p.end)) })
                    }
                    onInvalid={() => notify(`开始小节请输入 1—${count}`)}
                  />
                </label>
                <span>—</span>
                <label>
                  结束小节
                  <NumberField
                    label="结束小节"
                    min={p.start}
                    max={count}
                    value={p.end}
                    onValue={(n) => practice({ end: n })}
                    onInvalid={() => notify(`结束小节请输入 ${p.start}—${count}`)}
                  />
                </label>
              </div>
              <div className="block-navigation">
                <button
                  className="small-btn"
                  disabled={p.start === 1}
                  onClick={() => moveBlock(-1)}
                >
                  <Icon name="back" size={16} />
                  上一块
                </button>
                <button
                  className="small-btn"
                  disabled={p.end >= count}
                  onClick={() => moveBlock(1)}
                >
                  下一块
                  <Icon name="arrow" size={16} />
                </button>
              </div>
              <button
                className={`loop-toggle ${p.looping ? 'on' : ''}`}
                aria-pressed={p.looping}
                onClick={() => practice({ looping: !p.looping })}
              >
                <Icon name="repeat" size={18} />
                <span>循环当前片段</span>
                <span className="switch-dot" />
              </button>
              <p className="helper">按谱面小节顺序练习，忽略整曲反复与跳转。</p>
            </div>
            <div className="practice-section">
              <div className="section-label">
                <h3>播放速度</h3>
                <span className="speed-number">
                  {Math.round(p.speed * 100)}
                  <small>%</small>
                </span>
              </div>
              <input
                type="range"
                aria-label="播放速度"
                min={0.25}
                max={1.5}
                step={0.05}
                value={p.speed}
                onChange={(e) => practice({ speed: Number(e.target.value) })}
              />
              <div className="slider-labels">
                <span>慢一点 · 25%</span>
                <button className="text-btn" onClick={() => practice({ speed: 1 })}>
                  原速
                </button>
                <span>150%</span>
              </div>
              <div className="speed-presets">
                {[0.5, 0.75, 1].map((speed) => (
                  <button
                    key={speed}
                    className={p.speed === speed ? 'selected' : ''}
                    onClick={() => practice({ speed })}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>
            <div className="practice-section sound-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={p.metronome}
                  onChange={(e) => practice({ metronome: e.target.checked })}
                />
                <span>
                  节拍器<small>跟上每一拍</small>
                </span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={p.countIn}
                  onChange={(e) => practice({ countIn: e.target.checked })}
                />
                <span>
                  开始前预备拍<small>准备一小节，再开始</small>
                </span>
              </label>
              <label>
                音量 · {Math.round(p.masterVolume * 100)}%
                <input
                  type="range"
                  aria-label="播放音量"
                  min={0}
                  max={1}
                  step={0.05}
                  value={p.masterVolume}
                  onChange={(e) => practice({ masterVolume: Number(e.target.value) })}
                />
              </label>
              <button
                className="text-btn"
                onClick={() => practice({ masterVolume: p.masterVolume ? 0 : 0.25 })}
              >
                {p.masterVolume ? '静音' : '恢复低音量'}
              </button>
            </div>
            <div className="practice-section">
              <div className="section-label">
                <h3>我的练习段</h3>
                <button
                  className="text-btn"
                  onClick={() => {
                    setSegmentName(`第 ${p.start}—${p.end} 小节`);
                    setSegmentDialog(true);
                  }}
                >
                  <Icon name="plus" size={15} />
                  保存
                </button>
              </div>
              {p.segments.length === 0 ? (
                <p className="helper">把容易卡住的几小节存下来，下次接着练。</p>
              ) : (
                <div className="segments">
                  {p.segments.map((s) => (
                    <div key={s.id}>
                      <button
                        onClick={() => {
                          setSegmentMode(true);
                          practice({ start: s.start, end: s.end });
                        }}
                      >
                        <b>{s.name}</b>
                        <small>
                          {s.start}—{s.end} 小节
                        </small>
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`删除练习段 ${s.name}`}
                        onClick={() =>
                          practice({ segments: p.segments.filter((item) => item.id !== s.id) })
                        }
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="practice-tip">
              <Icon name="headphones" size={21} />
              <p>
                先慢后快。
                <br />
                <span>让每一个音都清晰，再回到原速。</span>
              </p>
            </div>
          </aside>
        )}
      </div>
      <section className="transport" aria-label="播放控制">
        <div className="transport-info">
          <span className="transport-icon">
            <Icon name="music" size={22} />
          </span>
          <div>
            <b>{doc.title || '未命名练习曲'}</b>
            <small>
              {state.ready
                ? `第 ${state.bar} 小节 · ${Math.round(p.speed * 100)}% 速度`
                : state.error
                  ? '加载失败'
                  : '正在准备音源…'}
            </small>
          </div>
        </div>
        <div className="transport-buttons">
          <button
            className="icon-btn"
            title="停止"
            aria-label="停止播放"
            disabled={!state.ready}
            onClick={() => engine.current?.stop()}
          >
            <Icon name="stop" size={19} />
          </button>
          <button
            className="play-button"
            aria-label={state.playing ? '暂停播放' : '开始播放'}
            disabled={!state.ready || Boolean(state.error)}
            onClick={() => engine.current?.toggle()}
          >
            <Icon name={state.playing ? 'pause' : 'play'} size={23} />
          </button>
          <button
            className={`icon-btn ${segmentMode ? 'active' : ''}`}
            aria-label="切换分块练习"
            aria-pressed={segmentMode}
            onClick={() => setSegmentMode(!segmentMode)}
          >
            <Icon name="repeat" size={21} />
          </button>
        </div>
        <div className="transport-progress">
          <span>{time(state.currentTime)}</span>
          <div className="progress-track">
            <span
              style={{
                width: `${state.totalTime ? Math.min(100, (state.currentTime / state.totalTime) * 100) : 0}%`,
              }}
            />
          </div>
          <span>{time(state.totalTime)}</span>
        </div>
        <span className="transport-mode">
          {editing
            ? '制谱预览'
            : segmentMode
              ? `${p.start}—${p.end} 小节${p.looping ? '循环' : '播放'}`
              : '整曲播放'}
        </span>
      </section>
      {segmentDialog && (
        <Modal title="保存练习段" onClose={() => setSegmentDialog(false)}>
          <label>
            练习段名称
            <input
              autoFocus
              maxLength={80}
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
            />
          </label>
          <p className="muted">
            第 {p.start}—{p.end} 小节{repo ? '，同时将曲目收藏到本机。' : ''}
          </p>
          <button
            className="button primary full"
            onClick={() => {
              const segments = [
                ...p.segments,
                {
                  id: crypto.randomUUID(),
                  name: segmentName.trim() || `第 ${p.start}—${p.end} 小节`,
                  start: p.start,
                  end: p.end,
                },
              ];
              if (segments.length > 100) {
                notify('每首曲目最多保存 100 个练习段');
                return;
              }
              if (repo) void copy({ ...doc, practice: { ...p, segments } }, false);
              else practice({ segments });
              setSegmentDialog(false);
            }}
          >
            <Icon name="save" size={17} />
            保存练习段
          </button>
        </Modal>
      )}
    </>
  );
}
