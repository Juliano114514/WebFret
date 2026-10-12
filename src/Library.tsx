import { useState } from 'react';
import { Icon, Modal } from './components';
import type { SourceVersion } from './sourceScore';
import {
  instrumentNames,
  measureCount,
  type CatalogEntry,
  type Instrument,
  type WebFretDocument,
} from './model';

interface Props {
  docs: WebFretDocument[];
  catalog: CatalogEntry[];
  onlyMine: boolean;
  catalogError: boolean;
  open: (id: string, repo: boolean) => void;
  create: (instrument: Instrument, title: string, notation: 'editable' | SourceVersion['notation']) => void;
  import: () => void;
  remove: (doc: WebFretDocument) => void;
  retryCatalog: () => void;
}
export default function Library({
  docs,
  catalog,
  onlyMine,
  catalogError,
  open,
  create,
  import: importAction,
  remove,
  retryCatalog,
}: Props) {
  const [query, setQuery] = useState('');
  const [instrument, setInstrument] = useState('all');
  const [newDialog, setNewDialog] = useState(false);
  const [newInstrument, setNewInstrument] = useState<Instrument>('guitar');
  const [newTitle, setNewTitle] = useState('');
  const [newNotation, setNewNotation] = useState<'editable' | SourceVersion['notation']>('numbered');
  const [deleteTarget, setDeleteTarget] = useState<WebFretDocument | null>(null);
  const matches = (title: string, artist: string, kind: Instrument) =>
    `${title} ${artist}`.toLowerCase().includes(query.toLowerCase()) &&
    (instrument === 'all' || (instrument === 'guitar' ? kind === 'guitar' : kind !== 'guitar'));
  const mine = docs.filter((d) => d.score.kind === 'source' ? d.score.versions.some((v) => matches(d.title, d.artist, v.instrument)) : matches(d.title, d.artist, d.score.instrument));
  const repository = catalog.filter((d) => d.kind === 'source' ? `${d.title} ${d.artist}`.toLowerCase().includes(query.toLowerCase()) && (instrument === 'all' || d.instruments?.some((i) => instrument === 'guitar' ? i === 'guitar' : i !== 'guitar')) : matches(d.title, d.artist, d.instrument));
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">YOUR EVERYDAY MUSIC COMPANION</span>
          <h1>{onlyMine ? '我的曲目' : '曲谱与练习'}</h1>
          <p>{onlyMine ? '把灵感留下，把每一小节练熟。' : '从喜欢的旋律开始，让练琴成为日常。'}</p>
        </div>
        <div className="row">
          <button className="button secondary" onClick={importAction}>
            <Icon name="upload" size={18} />
            导入曲目
          </button>
          <button className="button primary" onClick={() => setNewDialog(true)}>
            <Icon name="plus" size={18} />
            新建曲谱
          </button>
        </div>
      </header>
      {!onlyMine && (
        <section className="welcome-card">
          <div className="hero-copy">
            <span className="hero-tag">
              <span /> 每天一点，离喜欢的音乐近一点
            </span>
            <h2>
              把一首歌，
              <br />
              <em>练成自己的。</em>
            </h2>
            <p>
              四根弦，或六根弦。
              <br />
              一次专注两个小节，找到属于你的节奏。
            </p>
            <button
              className="hero-link"
              onClick={() => {
                if (catalog[0]) open(catalog[0].id, true);
                else setNewDialog(true);
              }}
            >
              开始今天的练习 <Icon name="arrow" size={17} />
            </button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-note note-one">♪</div>
            <div className="art-note note-two">♫</div>
            <svg viewBox="0 0 300 270">
              <g transform="rotate(26 150 140)">
                <path
                  d="M152 138c30-15 53 1 47 25-3 11 5 13 14 22 30 35 11 66-23 67-44 1-82-33-64-67 11-19-6-33 26-47z"
                  fill="#d7ab6e"
                />
                <path
                  d="M156 137c27-15 42 0 39 24-2 16 24 22 25 46 3 32-30 39-54 26-23-12-45-32-31-49 14-17-12-30 21-47z"
                  fill="#e7c18a"
                />
                <path d="m149 27 27-1 2 120-23 1z" fill="#6e5641" />
                <path d="M144 9h35l3 35h-38z" fill="#a4794b" />
                <circle cx="174" cy="180" r="17" fill="#553f2e" />
                <circle cx="174" cy="180" r="21" fill="none" stroke="#bd905a" strokeWidth="2" />
                <rect x="157" y="211" width="39" height="7" rx="2" fill="#6a4b32" />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <path
                    key={i}
                    d={`M${151 + i * 4} 23L${165 + i * 3} 216`}
                    stroke="#f6ead8"
                    strokeWidth="1"
                  />
                ))}
                {[55, 69, 83, 96, 108, 119, 130].map((y) => (
                  <path key={y} d={`M150 ${y}h26`} stroke="#c5b29a" strokeWidth="1.5" />
                ))}
                <path
                  d="M142 16h-7M142 29h-7M181 16h7M181 29h7"
                  stroke="#716a60"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            </svg>
            <div className="art-caption">
              <span>2</span> 小节 · 无限可能
            </div>
          </div>
        </section>
      )}
      <div className="library-toolbar">
        <div className="search-box">
          <Icon name="search" size={19} />
          <input
            aria-label="搜索曲名或作者"
            placeholder="搜索曲名、作者…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-btn" aria-label="清除搜索" onClick={() => setQuery('')}>
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        <div className="filter-tabs" aria-label="乐器筛选">
          {[
            ['all', '全部乐器'],
            ['guitar', '吉他'],
            ['ukulele', '尤克里里'],
          ].map(([key, name]) => (
            <button
              key={key}
              className={instrument === key ? 'active' : ''}
              onClick={() => setInstrument(key)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {!onlyMine && (
        <section className="library-section">
          <div className="section-title">
            <div>
              <h2>
                仓库曲库 <span>{repository.length}</span>
              </h2>
              <p>原图、共同旋律与四种演奏方式</p>
            </div>
            <span className="muted small">
              <Icon name="book" size={15} /> GitHub 维护
            </span>
          </div>
          {catalogError ? (
            <div className="empty-state">
              <p>暂时无法读取仓库曲库。本机曲目仍可使用。</p>
              <button className="small-btn" onClick={retryCatalog}>
                重新加载
              </button>
            </div>
          ) : repository.length === 0 ? (
            <div className="empty-state">没有找到符合条件的仓库曲目。</div>
          ) : (
            <div className="song-grid">
              {repository.map((entry, i) => (
                <article className={`song-card tone-${i % 3}`} key={entry.id}>
                  <button className="card-main" onClick={() => open(entry.id, true)}>
                    <div className="card-art">
                      <Icon name="guitar" size={42} />
                      <span className="card-instrument">
                        {entry.instrument === 'guitar' ? 'GUITAR' : 'UKULELE'}
                      </span>
                      <div className="string-decoration" />
                    </div>
                    <div className="card-body">
                      <div className="card-tags">
                        <span>{entry.kind === 'source' ? '三类谱源' : entry.instrument === 'guitar' ? '六线谱' : '四线谱'}</span>
                        <span>{entry.kind === 'source' ? '四种演奏' : entry.kind === 'guitar-pro' ? 'GP 曲谱' : '基础曲谱'}</span>
                      </div>
                      <h3>{entry.title}</h3>
                      <p>{entry.artist || '未知作者'}</p>
                      <div className="card-bottom">
                        <span>{entry.measureCount} {entry.kind === 'source' ? '行 / 小节' : '小节'}</span>
                        <span className="card-start">
                          开始练习 <Icon name="arrow" size={14} />
                        </span>
                      </div>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="library-section">
        <div className="section-title">
          <div>
            <h2>
              我的曲目 <span>{mine.length}</span>
            </h2>
            <p>你的创作、收藏与练习</p>
          </div>
          <button className="text-btn" onClick={importAction}>
            从文件导入 <Icon name="upload" size={15} />
          </button>
        </div>
        {mine.length === 0 ? (
          <div className="empty-state personal-empty">
            <div className="empty-icon">
              <Icon name="music" size={26} />
            </div>
            <h3>
              {query || instrument !== 'all' ? '还没有符合条件的曲目' : '第一首曲目，从这里开始'}
            </h3>
            <p>
              新建一份曲谱，或导入 WebFret / Guitar Pro 文件。
              <br />
              曲目保存在这台设备，也可以导出带走。
            </p>
            <button className="small-btn" onClick={() => setNewDialog(true)}>
              <Icon name="plus" size={16} />
              新建曲谱
            </button>
          </div>
        ) : (
          <div className="personal-list">
            {mine.map((doc) => (
              <article className="personal-row" key={doc.id}>
                <button className="personal-open" onClick={() => open(doc.id, false)}>
                  <div className="personal-icon">
                    <Icon name={doc.score.kind === 'editable' ? 'music' : 'guitar'} size={23} />
                  </div>
                  <div>
                    <h3>{doc.title || '未命名练习曲'}</h3>
                    <p>
                      {instrumentNames[doc.score.instrument]} <span>·</span>{' '}
                      {doc.artist || '我的创作'}
                    </p>
                  </div>
                </button>
                <span className="personal-count">{measureCount(doc)} {doc.score.kind === 'source' ? '行 / 小节' : '小节'}</span>
                <span className="small muted personal-date">
                  {new Date(doc.updatedAt).toLocaleDateString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <button
                  className="icon-btn danger"
                  aria-label={`删除 ${doc.title}`}
                  onClick={() => setDeleteTarget(doc)}
                >
                  <Icon name="trash" size={17} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="library-footer">
        <Icon name="headphones" size={16} /> 练慢一点，听清每一个音。
        <span>WebFret · 你的随身练琴本</span>
      </footer>
      {newDialog && (
        <Modal title="新建曲谱" onClose={() => setNewDialog(false)}>
          <p className="muted">一个小节，就是一个新的开始。</p>
          <label>
            曲名
            <input
              autoFocus
              value={newTitle}
              maxLength={200}
              placeholder="给你的曲目起个名字"
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <label>
            录入格式
            <select value={newNotation} onChange={(e) => setNewNotation(e.target.value as typeof newNotation)}>
              <option value="numbered">数字简谱 · 旋律与时值</option>
              <option value="tablature">弦品 / 指弹谱 · 时值可以未知</option>
              <option value="chord-chart">歌词和弦谱 · 切换位置</option>
              <option value="editable">基础六线 / 四线练习谱</option>
            </select>
          </label>
          <label>
            乐器与调弦
            <select
              value={newInstrument}
              onChange={(e) => setNewInstrument(e.target.value as Instrument)}
            >
              {Object.entries(instrumentNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="helper">{newNotation === 'editable' ? '默认 4/4 拍、80 BPM、4 个空小节，之后可以调整。' : '添加原图，按小节或乐句录入。未知时值 / 指法可以留空；每首歌可增加不同谱源。'}</p>
          <button
            className="button primary full"
            onClick={() => {
              create(newInstrument, newTitle.trim() || '未命名练习曲', newNotation);
              setNewDialog(false);
            }}
          >
            创建并开始写谱 <Icon name="arrow" size={17} />
          </button>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="删除本机曲目" onClose={() => setDeleteTarget(null)}>
          <p>删除“{deleteTarget.title}”及其练习设置？</p>
          <p className="muted">如果尚未导出备份，删除后无法恢复。</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDeleteTarget(null)}>
              取消
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                remove(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              删除曲目
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
