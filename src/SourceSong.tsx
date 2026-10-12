import { useEffect, useRef, useState } from 'react';
import { Icon, Modal } from './components';
import { exportDocument } from './files';
import { tunings, validateDocument, type Duration, type Instrument, type WebFretDocument } from './model';
import { completeSource, createSourceDocument, type Scenario, type SourceEvent, type SourceLine, type SourceVersion } from './sourceScore';
interface Props {
  initial: WebFretDocument;
  repo: boolean;
  editing: boolean;
  back: () => void;
  toggleEdit: () => void;
  copy: (doc: WebFretDocument, edit: boolean) => Promise<void>;
  save: (doc: WebFretDocument) => Promise<void>;
  openGenerated: (doc: WebFretDocument) => Promise<void>;
  notify: (message: string) => void;
}
const notationNames = {
  tablature: '弦品谱 / 指弹谱',
  numbered: '数字简谱',
  'chord-chart': '歌词和弦谱'
};
const scenarioNames: Record<Scenario, string> = {
  'guitar-accompaniment': '吉他伴奏',
  'guitar-fingerstyle': '吉他指弹',
  'ukulele-accompaniment': '尤克里里伴奏',
  'ukulele-fingerstyle': '尤克里里指弹'
};
const originNames = {
  source: '原谱录入',
  manual: '手动补全',
  suggested: '建议',
  missing: '待补全'
};
function blankEvent(): SourceEvent {
  return {
    id: crypto.randomUUID(),
    degree: null,
    octave: 0,
    accidental: 0,
    notes: [],
    duration: null,
    dotted: false,
    tie: false,
    tuplet: null,
    lyric: '',
    raw: '',
    review: '',
    durationOrigin: 'missing',
    fingeringOrigin: 'missing'
  };
}
function blankLine(bar: boolean): SourceLine {
  return {
    id: crypto.randomUUID(),
    label: bar ? '新小节' : '新乐句',
    page: 0,
    lyrics: '',
    raw: '',
    review: '',
    bar,
    numerator: null,
    denominator: null,
    events: [],
    chordChanges: []
  };
}
function NumberedEvent({
  event
}: {
  event: SourceEvent;
}) {
  const underlines = event.duration ? Math.max(0, Math.log2(event.duration) - 2) : 0;
  return <span className={`numbered-event ${event.review ? 'needs-review' : ''}`} title={event.review || event.raw}>
    <span className="octave-dots">{Array.from({ length: Math.max(0, event.octave) }, (_, i) => <i key={i}>•</i>)}</span>
    <span className="numbered-value">{event.raw === '-' ? '−' : <>{event.accidental === -1 ? '♭' : event.accidental === 1 ? '♯' : ''}{event.degree ?? '?'}</>}{event.dotted && '·'}</span>
    <span className="duration-lines">{Array.from({
        length: underlines
      }, (_, i) => <i key={i} />)}</span>
    <span className="octave-dots lower">{Array.from({ length: Math.max(0, -event.octave) }, (_, i) => <i key={i}>•</i>)}</span>
    <small>{event.duration === null ? '?' : event.duration < 4 ? `+${4 / event.duration - 1}拍` : ''}{event.tuplet === 3 ? '③' : ''}{event.tie && event.raw !== '-' ? '⌒' : ''}</small>
    <span className="event-lyric">{event.lyric}</span>
  </span>;
}
function TabLine({
  line,
  instrument,
  editEvent
}: {
  line: SourceLine;
  instrument: Instrument;
  editEvent: () => void;
}) {
  const width = Math.max(460, line.events.length * 42 + 60);
  return <div className="tab-line-scroll"><svg role="img" aria-label={`${line.label}，${line.events.length}个拍点`} width={width} height={150} viewBox={`0 0 ${width} 150`}>
    {tunings[instrument].map((name, i) => <g key={name + i}><text x="0" y={29 + i * 15} fontSize="11" fill="#798472">{i + 1}</text><line x1="24" y1={25 + i * 15} x2={width - 12} y2={25 + i * 15} stroke="#84907b" strokeWidth="1" /></g>)}
    {line.events.map((event, index) => <g key={event.id} onClick={editEvent} className="tab-event">
      {event.notes.map(note => <g key={note.string}><rect x={40 + index * 42 - 11} y={14 + (note.string - 1) * 15} width="26" height="19" fill="#fffef9" /><text textAnchor="middle" x={40 + index * 42 + 2} y={30 + (note.string - 1) * 15} fontSize="17" fill="#243e32">{note.fret}</text></g>)}
      <text textAnchor="middle" x={42 + index * 42} y="131" fontSize="10" fill={event.durationOrigin === 'missing' ? '#b07c30' : '#63725a'}>{event.duration ? `1/${event.duration}${event.dotted ? '·' : ''}` : '?'}</text>
    </g>)}
  </svg></div>;
}
function SourceChordDiagram({
  chord
}: {
  chord: SourceVersion['chords'][number];
}) {
  const count = chord.frets.length;
  const max = Math.max(3, ...chord.frets);
  const min = max > 5 ? Math.max(1, Math.min(...chord.frets.filter(n => n > 0))) : 1;
  return <figure className="source-chord" title={chord.note}><figcaption>{chord.name}</figcaption><svg role="img" aria-label={`${chord.name}，从一弦起品位${chord.frets.join('，')}`} viewBox="0 0 100 112">
    {Array.from({
        length: count
      }, (_, i) => <line key={i} x1={18 + i * 64 / (count - 1)} x2={18 + i * 64 / (count - 1)} y1="18" y2="98" stroke="#697b63" />)}
    {[0, 1, 2, 3, 4].map(i => <line key={i} x1="18" x2="82" y1={18 + i * 20} y2={18 + i * 20} stroke="#697b63" strokeWidth={i === 0 && min === 1 ? 3 : 1} />)}
    {min > 1 && <text x="0" y="31" fontSize="12">{min}</text>}
    {chord.frets.map((fret, index) => {
        const x = 82 - index * 64 / (count - 1);
        return fret <= 0 ? <text key={index} x={x} y="12" textAnchor="middle" fontSize="12">{fret < 0 ? '×' : '○'}</text> : <g key={index}><circle cx={x} cy={28 + (fret - min) * 20} r="8" fill="#315644" /><text x={x} y={32 + (fret - min) * 20} textAnchor="middle" fontSize="11" fill="white">{chord.fingers[index] ?? ''}</text></g>;
      })}
  </svg></figure>;
}
export default function SourceSong({
  initial,
  repo,
  editing,
  back,
  toggleEdit,
  copy,
  save,
  openGenerated,
  notify
}: Props) {
  const [doc, setDoc] = useState(initial);
  const [selected, setSelected] = useState(initial.score.kind === 'source' ? initial.score.melodySourceId : '');
  const [view, setView] = useState<'shared' | 'source'>('shared');
  const [saveState, setSaveState] = useState('saved');
  const [imagePage, setImagePage] = useState<number | null>(null);
  const [lineDraft, setLineDraft] = useState<SourceLine | null>(null);
  const [versionDraft, setVersionDraft] = useState<SourceVersion | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState<Scenario>('guitar-fingerstyle');
  const [key, setKey] = useState('G');
  const [tempo, setTempo] = useState(68);
  const [fallback, setFallback] = useState<Duration>(8);
  const [approximate, setApproximate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newNotation, setNewNotation] = useState<SourceVersion['notation']>('numbered');
  const [imageScale, setImageScale] = useState(100);
  const [uploading, setUploading] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;
  useEffect(() => {
    if (repo) return;
    const current = ++revision.current;
    setSaveState('saving');
    void save(doc).then(() => {
      if (current === revision.current) setSaveState('saved');
    }).catch(() => {
      if (current === revision.current) setSaveState('error');
    });
  }, [doc, repo, save]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!repo && saveState !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [repo, saveState]);
  if (doc.score.kind !== 'source') return null;
  const score = doc.score;
  const common = score.versions.find(v => v.id === score.melodySourceId)!;
  const version = score.versions.find(v => v.id === (view === 'shared' ? score.melodySourceId : selected)) ?? common;
  const missing = common.lines.flatMap(l => l.events).filter(e => e.duration === null).length;
  const reviews = version.lines.filter(l => l.review || l.events.some(e => e.review));
  const canEdit = editing && !repo;
  function commit(next: WebFretDocument): boolean {
    try {
      next.updatedAt = new Date().toISOString();
      const valid = validateDocument(next);
      docRef.current = valid;
      setDoc(valid);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '录入无效');
      return false;
    }
  }
  function changeVersion(next: SourceVersion): boolean {
    return commit({
      ...doc,
      score: {
        ...score,
        versions: score.versions.map(v => v.id === next.id ? next : v)
      }
    });
  }
  function editLine(line: SourceLine): void {
    if (canEdit) {
      setLineDraft(structuredClone(line));
      setNoteDrafts({});
      setError('');
    }
  }
  function saveLine(): void {
    if (!lineDraft) return;
    try {
      const events = lineDraft.events.map(event => {
        if (!(event.id in noteDrafts)) return event;
        const value = noteDrafts[event.id].trim();
        if (value && !/^\d+:\d+(?:\s+\d+:\d+)*$/.test(value)) throw new Error('弦品格式为 1:0 2:3；请修正后保存');
        const notes = value ? value.split(/\s+/).map(n => {
          const [string, fret] = n.split(':').map(Number);
          return {
            string,
            fret
          };
        }) : [];
        return {
          ...event,
          notes,
          fingeringOrigin: value ? 'manual' as const : 'missing' as const
        };
      });
      if (changeVersion({
        ...version,
        lines: version.lines.map(l => l.id === lineDraft.id ? {
          ...lineDraft,
          events
        } : l)
      })) setLineDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '录入无效');
    }
  }
  function saveVersion(): void {
    if (!versionDraft) return;
    try {
      if (commit({
        ...doc,
        title: titleDraft,
        score: {
          ...score,
          versions: score.versions.map(v => v.id === versionDraft.id ? versionDraft : v)
        }
      })) setVersionDraft(null);
    } catch {
      setError('谱源信息无效，请修正后保存');
    }
  }
  async function addImages(files: FileList | null): Promise<void> {
    if (!files?.length || uploading) return;
    setUploading(true);
    const targetId = version.id;
    try {
      if (version.pages.length + files.length > 16) throw new Error('每个谱源最多保留 16 张原图');
      const addedChars = Array.from(files).reduce((sum, file) => sum + Math.ceil(file.size / 3) * 4 + 40, 0);
      const existingChars = score.versions.flatMap(v => v.pages).reduce((sum, p) => sum + p.image.length, 0);
      if (existingChars + addedChars > 16 * 1024 * 1024) throw new Error('原图总量超过一首歌的容量，请分批或缩小图片');
      if (Array.from(files).some(file => file.size > 4 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) throw new Error('每张原图限 4 MiB，只支持 JPEG、PNG、WebP');
      const pages: SourceVersion['pages'] = [];
      for (const file of Array.from(files)) {
        if (file.size > 4 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('每张原图限 4 MiB，只支持 JPEG、PNG、WebP');
        const image = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error('原图读取失败'));
          r.readAsDataURL(file);
        });
        pages.push({
          id: crypto.randomUUID(),
          label: file.name,
          image
        });
      }
      const latest = docRef.current;
      if (latest.score.kind !== 'source') throw new Error('曲目已切换，请重试');
      commit({
        ...latest,
        score: {
          ...latest.score,
          versions: latest.score.versions.map(v => v.id === targetId ? {
            ...v,
            pages: [...v.pages, ...pages]
          } : v)
        }
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : '原图添加失败');
    } finally {
      setUploading(false);
    }
    if (upload.current) upload.current.value = '';
  }
  async function generate(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const generated = completeSource(doc, scenario, {
        key,
        tempo,
        fallbackDuration: fallback,
        allowApproximate: approximate
      });
      await openGenerated(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法生成练习谱');
    } finally {
      setBusy(false);
    }
  }
  return <>
    <div className="song-topbar"><button className="text-btn" onClick={back}><Icon name="back" size={18} />返回曲库</button><div className="save-state">{repo ? '仓库曲目' : saveState === 'saved' ? '已保存到本机' : saveState === 'saving' ? '正在保存…' : <button className="text-btn danger" onClick={() => setDoc({
          ...doc
        })}>保存失败 · 重试</button>}</div></div>
    <header className="song-heading"><div><span className="eyebrow">ONE SONG · FOUR WAYS TO PLAY</span><h1>{doc.title}</h1><p>{doc.artist || '我的曲目'} · {score.versions.length} 个谱源 · 共用主旋律、歌词与时值</p></div><div className="row wrap">
      {repo ? <button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try { await copy(doc, true); } finally { setBusy(false); } }}>{busy ? '正在收藏…' : '收藏并编辑'}</button> : <button className="button primary" onClick={toggleEdit}>{editing ? '结束录入' : '录入 / 校对'}</button>}
      <button className="button secondary" onClick={() => exportDocument(doc)}><Icon name="download" size={16} />导出含原图的曲目</button>
    </div></header>
    <div className="source-intro"><Icon name="music" size={21} /><p><b>一首歌，一份共同旋律，四种演奏方式。</b><br />共同旋律以「{common.title}」为依据；其他谱源保留各自调性与编配。补时值、配指法会生成独立练习副本，建议有明确标记。</p></div>
    <div className="source-layout"><section className="source-main">
      <div className="source-tabs" role="tablist" aria-label="谱源视图"><button role="tab" aria-selected={view === 'shared'} className={view === 'shared' ? 'active' : ''} onClick={() => {
            setView('shared');
            setImagePage(null);
          }}>共同旋律</button>{score.versions.map(v => <button key={v.id} role="tab" aria-selected={view === 'source' && selected === v.id} className={view === 'source' && selected === v.id ? 'active' : ''} onClick={() => {
            setView('source');
            setSelected(v.id);
            setImagePage(null);
          }}>{notationNames[v.notation]}</button>)}</div>
      <div className="source-paper"><div className="source-paper-header"><div><h2>{version.title}</h2><p>{notationNames[version.notation]} · {version.key ? `1 = ${version.key}` : '调性未标'} · {version.numerator && version.denominator ? `${version.numerator}/${version.denominator}` : '拍号未标完整'} · {version.tempo ? `♩ = ${version.tempo}` : '速度未标'} · {version.capo === null ? '变调夹未标' : `Capo ${version.capo}`}</p></div><div className="row wrap">
        {canEdit && <button className="small-btn" onClick={() => {
                setVersionDraft(structuredClone(version));
                setTitleDraft(doc.title);
                setError('');
              }}>谱源信息</button>}
        {version.pages.map((page, i) => <button className="small-btn" key={page.id} onClick={() => {
                setImagePage(i);
                setImageScale(100);
              }}>原图 {i + 1}</button>)}
        {canEdit && <button className="small-btn" disabled={uploading} onClick={() => upload.current?.click()}>{uploading ? '读取原图…' : '添加原图'}</button>}
      </div></div>
      {version.notes.length > 0 && <details className="source-notes"><summary>原谱说明与录入边界</summary>{version.notes.map((note, i) => <p key={i}>{note}</p>)}</details>}
      {version.chords.length > 0 && <div className="source-chord-list">{version.chords.map((chord, i) => <SourceChordDiagram key={chord.name + i} chord={chord} />)}</div>}
      {version.notation === 'tablature' && <p className="helper">弦号从上到下为第 1 弦起。品位按原图录入；「?」表示原图没有时值，不依据横向间距猜节奏。</p>}
      {version.notation === 'numbered' && <p className="helper">数字为音级，上下点表示八度，下划线表示减时，③ 表示三连音。长音显示额外拍数；原始符号、连音与编曲说明可逐小节校对。</p>}
      <div className={`source-lines ${version.notation === 'numbered' ? 'numbered-lines' : ''}`}>{version.lines.map((line, index) => <article className={`source-line ${line.review ? 'has-review' : ''}`} key={line.id}>
        <div className="source-line-heading"><span>{line.label || `${line.bar ? '小节' : '乐句'} ${index + 1}`}{line.numerator && ` · ${line.numerator}/${line.denominator}`}</span>{canEdit && <button className="text-btn" onClick={() => editLine(line)}>编辑</button>}<button className="text-btn" disabled={!version.pages.length} onClick={() => {
                  setImagePage(line.page);
                  setImageScale(160);
                }}>对照原图</button></div>
        {version.notation === 'tablature' ? <TabLine line={line} instrument={version.instrument} editEvent={() => editLine(line)} /> : version.notation === 'numbered' ? <div className="numbered-bar">{line.events.map((event, ei) => <span key={event.id} className="numbered-slot"><span className="numbered-chord">{line.chordChanges.filter(c => c.at === ei).map(c => c.name).join(' / ')}</span><NumberedEvent event={event} /></span>)}</div> : <div className="chord-lyrics">{Array.from(line.lyrics).map((char, i) => <span key={i}><b>{line.chordChanges.filter(c => c.at === i).map(c => c.name).join(' / ')}</b>{char}</span>)}<span><b>{line.chordChanges.filter(c => c.at === line.lyrics.length).map(c => c.name).join(' / ')}</b></span></div>}
        {version.notation !== 'chord-chart' && line.lyrics && <p className="line-lyrics">{line.lyrics}</p>}
        {line.review && <p className="review-note">待核对：{line.review}</p>}
        {line.raw && <details className="raw-symbols"><summary>原始符号与注释</summary><p>{line.raw}</p></details>}
      </article>)}</div>
      {version.lines.length === 0 && <div className="empty-state">还没有录入内容。添加原图后，可按小节或歌词乐句录入。</div>}
      {canEdit && <div className="source-add-row"><button className="button secondary" onClick={() => changeVersion({
              ...version,
              lines: [...version.lines, blankLine(version.notation === 'numbered')]
            })}>+ 添加{version.notation === 'numbered' ? '小节' : '乐句'}</button><select aria-label="新增谱源类型" value={newNotation} onChange={e => setNewNotation(e.target.value as SourceVersion['notation'])}>{Object.entries(notationNames).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><button className="small-btn" disabled={score.versions.length >= 8} onClick={() => {
              const newDoc = createSourceDocument(version.instrument, doc.title, newNotation);
              if (newDoc.score.kind === 'source') {
                const next = newDoc.score.versions[0];
                if (commit({
                  ...doc,
                  score: {
                    ...score,
                    versions: [...score.versions, next]
                  }
                })) {
                  setSelected(next.id);
                  setView('source');
                }
              }
            }}>+ 增加谱源</button></div>}
      </div>
    </section><aside className="source-side"><section className="source-panel"><h2>四种练习</h2><p className="helper">都从共同旋律「{common.title}」出发。选择调性会同步移调旋律与和弦。</p><div className="scenario-grid">{Object.entries(scenarioNames).map(([id, name]) => <button key={id} className={scenario === id ? 'active' : ''} onClick={() => setScenario(id as Scenario)}>{name}</button>)}</div>
      <label>练习调性<select value={key} onChange={e => setKey(e.target.value)}>{['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>练习速度（BPM）<input type="number" min="20" max="300" value={tempo} onChange={e => setTempo(Number(e.target.value))} /></label>
      {missing > 0 && <div className="completion-warning"><b>{missing} 个音缺少时值</b><p>先手动录入时值，或明确采用等分节奏来练音。等分节奏不能代表原曲节奏。</p><label className="check"><input type="checkbox" checked={approximate} onChange={e => setApproximate(e.target.checked)} />允许等分练习时值</label>{approximate && <label>等分时值<select value={fallback} onChange={e => setFallback(Number(e.target.value) as Duration)}>{[4, 8, 16].map(n => <option key={n} value={n}>{n} 分音符</option>)}</select></label>}</div>}
      <p className="helper">伴奏采用建议分解和弦；指弹采用共同旋律与可达低音。自动选择的弦品和右手分配需试听、试弹后调整。原图没有的指法不冒充原谱。</p>
      {error && <p className="review-note" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy || missing > 0 && !approximate} onClick={() => void generate()}>{busy ? '正在生成…' : `生成${scenarioNames[scenario]}练习副本`}</button>
      <p className="helper">生成后可以读谱、试听、修改、循环练习与导出 GP。</p>
    </section><section className="source-panel"><h3>共同数据</h3><p>主旋律、歌词、时值只选择一份依据。更换依据会影响之后生成的四种练习，已保存的副本保留。</p><label>共同旋律谱源<select aria-label="共同旋律谱源" value={score.melodySourceId} disabled={!canEdit} onChange={e => commit({
              ...doc,
              score: {
                ...score,
                melodySourceId: e.target.value
              }
            })}>{score.versions.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select></label><p className="helper">{common.key ? `原谱调性 ${common.key}` : '调性待录入'} · {common.tempo ? `${common.tempo} BPM` : '原速度未知'} · {missing ? '存在时值待补全' : '已录入时值'}</p><p className="helper">和弦来源沿用共同旋律谱中的换拍点；其他谱的歌词位置不能直接等同于拍点。</p></section>
    <section className="source-panel"><h3>校对提醒</h3><p>{reviews.length ? `当前谱源有 ${reviews.length} 行含待核对项。点击“对照原图”，在本机副本中逐项修正。` : '原图始终保留，可在录入时逐项核对。'}</p><p className="helper">左右手细节、连音、节奏型、装饰与编配文字以原图为完整依据。结构化播放只覆盖已录入字段。</p></section>
    <details className="source-panel"><summary>图片识谱辅助工具</summary><p><a href="https://www.soundslice.com/help/en/creating/pdf-import/297/tab-only-music/" target="_blank" rel="noreferrer">Soundslice</a> 支持纯六线谱识别，但导入音符统一为四分音符，仍需补节奏。</p><p><a href="https://github.com/lodebar2026/dolce#readme" target="_blank" rel="noreferrer">悦谱 Dolce</a> 作者提供数字简谱、时值和中文歌词识别，可逐音校对。尚未用这组图片验证识别效果。</p><p className="helper">不自动上传原图。WebFret 可导入 GP / GPX；识别工具导出的 MusicXML / MIDI 暂未接入。</p></details>
    </aside></div>
    <input ref={upload} className="file-input" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="添加曲谱原图" onChange={e => void addImages(e.target.files)} />
    {imagePage !== null && version.pages[imagePage] && <Modal title={`原图校对 · ${version.pages[imagePage].label}`} onClose={() => setImagePage(null)}><label>放大 {imageScale}%<input type="range" min="60" max="250" value={imageScale} onChange={e => setImageScale(Number(e.target.value))} /></label><div className="source-image-scroll"><img src={version.pages[imagePage].image} style={{
          width: `${imageScale}%`,
          maxWidth: 'none'
        }} alt={version.pages[imagePage].label} /></div></Modal>}
    {versionDraft && <Modal title="谱源信息" onClose={() => {
      setVersionDraft(null);
      setError('');
    }}>
      <label>谱源名称<input value={versionDraft.title} maxLength={200} onChange={e => setVersionDraft({
          ...versionDraft,
          title: e.target.value
        })} /></label>
      <label>曲名<input value={titleDraft} maxLength={200} onChange={e => setTitleDraft(e.target.value)} /></label>
      <label>乐器<select value={versionDraft.instrument} onChange={e => setVersionDraft({
          ...versionDraft,
          instrument: e.target.value as Instrument
        })}>{[['guitar', '吉他'], ['ukulele-high', '尤克里里 High-G'], ['ukulele-low', '尤克里里 Low-G']].map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <label>调性（未知留空）<input value={versionDraft.key} maxLength={20} onChange={e => setVersionDraft({
          ...versionDraft,
          key: e.target.value
        })} /></label>
      <div className="source-fields"><label>原速度<input type="number" min="20" max="300" value={versionDraft.tempo ?? ''} onChange={e => setVersionDraft({
            ...versionDraft,
            tempo: e.target.value === '' ? null : Number(e.target.value)
          })} /></label><label>拍号分子<input type="number" min="1" max="12" value={versionDraft.numerator ?? ''} onChange={e => setVersionDraft({
            ...versionDraft,
            numerator: e.target.value === '' ? null : Number(e.target.value)
          })} /></label><label>拍号分母<select value={versionDraft.denominator ?? ''} onChange={e => setVersionDraft({
            ...versionDraft,
            denominator: e.target.value ? Number(e.target.value) as 2 | 4 | 8 : null
          })}><option value="">未知</option>{[2, 4, 8].map(n => <option key={n}>{n}</option>)}</select></label><label>变调夹<input type="number" min="0" max="12" value={versionDraft.capo ?? ''} onChange={e => setVersionDraft({
            ...versionDraft,
            capo: e.target.value === '' ? null : Number(e.target.value)
          })} /></label></div>
      <label>说明（每行一条）<textarea rows={5} value={versionDraft.notes.join('\n')} onChange={e => setVersionDraft({
          ...versionDraft,
          notes: e.target.value.split('\n')
        })} /></label>
      <details><summary>和弦指型与手指编号</summary><p className="helper">按第一弦起填写。品位 0 为空弦，-1 为不弹；左手指号 1–4，原图未标则留空。</p>
        {versionDraft.chords.map((chord, ci) => <fieldset className="source-chord-editor" key={ci}>
          <label>和弦名称<input value={chord.name} maxLength={40} onChange={e => setVersionDraft({ ...versionDraft, chords: versionDraft.chords.map((c, j) => j === ci ? { ...c, name: e.target.value } : c) })} /></label>
          <div className="source-fields">{chord.frets.map((fret, si) => <div key={si}>
            <label>第 {si + 1} 弦品位<input type="number" min="-1" max="24" value={fret} onChange={e => setVersionDraft({ ...versionDraft, chords: versionDraft.chords.map((c, j) => j === ci ? { ...c, frets: c.frets.map((f, k) => k === si ? e.target.value === '' ? -1 : Number(e.target.value) : f) } : c) })} /></label>
            <label>第 {si + 1} 弦左手指号<input type="number" min="1" max="4" value={chord.fingers[si] ?? ''} onChange={e => setVersionDraft({ ...versionDraft, chords: versionDraft.chords.map((c, j) => j === ci ? { ...c, fingers: c.frets.map((_, k) => k === si ? e.target.value === '' ? null : Number(e.target.value) : c.fingers[k] ?? null) } : c) })} /></label>
          </div>)}</div>
          <button className="text-btn danger" onClick={() => setVersionDraft({ ...versionDraft, chords: versionDraft.chords.filter((_, j) => j !== ci) })}>移除此指型</button>
        </fieldset>)}
        <button className="small-btn" disabled={versionDraft.chords.length >= 100} onClick={() => setVersionDraft({ ...versionDraft, chords: [...versionDraft.chords, { name: 'C', frets: tunings[versionDraft.instrument].map(() => -1), fingers: tunings[versionDraft.instrument].map(() => null), note: '' }] })}>+ 添加和弦指型</button>
      </details>
      {error && <p role="alert" className="review-note">{error}</p>}<button className="button primary full" onClick={saveVersion}>保存谱源信息</button>
    </Modal>}
    {lineDraft && <Modal title={`录入 / 校对 · ${lineDraft.label}`} onClose={() => {
      setLineDraft(null);
      setError('');
    }}>
      <p className="helper">无时值、无指法可以留空，保存为“待补全”。修改只写本机谱源；练习建议另存副本。</p>
      <label>乐句 / 小节名称<input value={lineDraft.label} maxLength={200} onChange={e => setLineDraft({
          ...lineDraft,
          label: e.target.value
        })} /></label>
      <label>整行歌词<textarea rows={2} value={lineDraft.lyrics} maxLength={2000} onChange={e => setLineDraft({
          ...lineDraft,
          lyrics: e.target.value
        })} /></label>
      <div className="source-fields"><label>原图页<select value={lineDraft.page} onChange={e => setLineDraft({
            ...lineDraft,
            page: Number(e.target.value)
          })}>{(version.pages.length ? version.pages : [{
              label: '未添加原图'
            }]).map((p, i) => <option key={i} value={i}>{i + 1} · {p.label}</option>)}</select></label><label className="check"><input type="checkbox" checked={lineDraft.bar} onChange={e => setLineDraft({
            ...lineDraft,
            bar: e.target.checked
          })} />有小节边界</label><label>此小节拍数<input type="number" min="1" max="12" value={lineDraft.numerator ?? ''} onChange={e => setLineDraft({
            ...lineDraft,
            numerator: e.target.value ? Number(e.target.value) : null
          })} /></label><label>此小节拍号分母<select value={lineDraft.denominator ?? ''} onChange={e => setLineDraft({
            ...lineDraft,
            denominator: e.target.value ? Number(e.target.value) as 2 | 4 | 8 : null
          })}><option value="">沿用 / 未知</option>{[2, 4, 8].map(n => <option key={n}>{n}</option>)}</select></label></div>
      {version.notation !== 'chord-chart' && <div className="source-event-editor">{lineDraft.events.map((event, index) => {
          const change = (patch: Partial<SourceEvent>) => setLineDraft({
            ...lineDraft,
            events: lineDraft.events.map(e => e.id === event.id ? {
              ...e,
              ...patch
            } : e)
          });
          return <fieldset key={event.id}><legend>音 {index + 1} · {originNames[event.durationOrigin]}</legend><div className="source-fields">
          <label>音级<select value={event.degree ?? ''} onChange={e => change({
                  degree: e.target.value === '' ? null : Number(e.target.value)
                })}><option value="">未标</option>{[0, 1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n === 0 ? '0 休止' : n}</option>)}</select></label><label>八度<select value={event.octave} onChange={e => change({
                  octave: Number(e.target.value)
                })}>{[-2, -1, 0, 1, 2].map(n => <option key={n} value={n}>{n === 0 ? '中音' : `${n > 0 ? '高' : '低'} ${Math.abs(n)} 八度`}</option>)}</select></label><label>升降<select value={event.accidental} onChange={e => change({
                  accidental: Number(e.target.value) as -1 | 0 | 1
                })}><option value="0">无</option><option value="-1">♭</option><option value="1">♯</option></select></label><label>时值<select value={event.duration ?? ''} onChange={e => change({
                  duration: e.target.value ? Number(e.target.value) as Duration : null,
                  durationOrigin: e.target.value ? 'manual' : 'missing'
                })}><option value="">未知</option>{[1, 2, 4, 8, 16, 32].map(n => <option key={n} value={n}>{n} 分音符</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={event.dotted} onChange={e => change({
                  dotted: e.target.checked,
                  durationOrigin: event.duration ? 'manual' : 'missing'
                })} />附点</label><label className="check"><input type="checkbox" checked={event.tie} onChange={e => change({
                  tie: e.target.checked
                })} />延音</label><label className="check"><input type="checkbox" checked={event.tuplet === 3} onChange={e => change({
                  tuplet: e.target.checked ? 3 : null
                })} />三连音</label>
        </div><label>弦:品（空白为待补全，多音用空格分隔）<input placeholder="1:0 2:3" value={noteDrafts[event.id] ?? event.notes.map(n => `${n.string}:${n.fret}`).join(' ')} onChange={e => setNoteDrafts({
                ...noteDrafts,
                [event.id]: e.target.value
              })} /></label><label>此音歌词<input value={event.lyric} maxLength={100} onChange={e => change({
                lyric: e.target.value
              })} /></label><label>原符号 / 待核对<input value={event.raw} maxLength={200} onChange={e => change({
                raw: e.target.value
              })} /><input aria-label={`音 ${index + 1} 待核对说明`} value={event.review} maxLength={1000} onChange={e => change({
                review: e.target.value
              })} /></label><button className="text-btn danger" onClick={() => setLineDraft({
              ...lineDraft,
              events: lineDraft.events.filter(e => e.id !== event.id),
              chordChanges: lineDraft.chordChanges.filter(c => c.at !== index).map(c => ({
                ...c,
                at: c.at > index ? c.at - 1 : c.at
              }))
            })}>删除此音</button></fieldset>;
        })}<button className="small-btn" onClick={() => setLineDraft({
          ...lineDraft,
          events: [...lineDraft.events, blankEvent()]
        })}>+ 添加音符 / 休止</button></div>}
      <div className="source-change-editor"><h3>和弦切换</h3><p className="helper">{version.notation === 'chord-chart' ? '位置从 0 开始，是歌词字符偏移。' : '位置从 0 开始，是本小节第几个音符 / 休止。'}</p>{lineDraft.chordChanges.map((c, i) => <div className="source-fields" key={i}><label>位置<input type="number" min="0" value={c.at} onChange={e => setLineDraft({
              ...lineDraft,
              chordChanges: lineDraft.chordChanges.map((v, j) => i === j ? {
                ...v,
                at: Number(e.target.value)
              } : v)
            })} /></label><label>和弦<input value={c.name} maxLength={40} onChange={e => setLineDraft({
              ...lineDraft,
              chordChanges: lineDraft.chordChanges.map((v, j) => i === j ? {
                ...v,
                name: e.target.value
              } : v)
            })} /></label><button className="text-btn danger" onClick={() => setLineDraft({
            ...lineDraft,
            chordChanges: lineDraft.chordChanges.filter((_, j) => j !== i)
          })}>移除</button></div>)}<button className="small-btn" onClick={() => setLineDraft({
          ...lineDraft,
          chordChanges: [...lineDraft.chordChanges, {
            at: 0,
            name: 'C'
          }]
        })}>+ 添加和弦切换</button></div>
      <label>原始符号 / 编配说明<textarea rows={3} value={lineDraft.raw} maxLength={4000} onChange={e => setLineDraft({
          ...lineDraft,
          raw: e.target.value
        })} /></label><label>待核对事项<textarea rows={2} value={lineDraft.review} maxLength={2000} onChange={e => setLineDraft({
          ...lineDraft,
          review: e.target.value
        })} /></label>
      {error && <p role="alert" className="review-note">{error}</p>}<div className="modal-actions"><button className="button secondary" onClick={() => setLineDraft(null)}>取消</button><button className="button primary" onClick={saveLine}>保存录入</button></div>
    </Modal>}
  </>;
}
