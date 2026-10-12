import { useCallback, useEffect, useRef, useState } from 'react';
import Library from './Library';
import Song from './Song';
import SourceSong from './SourceSong';
import { createSourceDocument, type SourceVersion } from './sourceScore';
import { Icon, Modal } from './components';
import { exportBackup, importFile, MAX_DOCUMENT_BYTES } from './files';
import {
  copyDocument,
  createDocument,
  type CatalogEntry,
  type Instrument,
  type WebFretDocument,
} from './model';
import { storage } from './storage';
import { usePwa } from './usePwa';

function navigate(hash: string): void {
  window.location.hash = hash;
}
export default function App() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  const [docs, setDocs] = useState<WebFretDocument[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [doc, setDoc] = useState<WebFretDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [dbError, setDbError] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [backupHelp, setBackupHelp] = useState(false);
  const [updateConfirm, setUpdateConfirm] = useState(false);
  const [restorePreview, setRestorePreview] = useState<WebFretDocument[] | null>(null);
  const [fileMode, setFileMode] = useState<'import' | 'restore'>('import');
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pwa = usePwa();
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6500);
  }, []);
  const refreshDocs = useCallback(async () => {
    try {
      setDocs(await storage.list());
      setDbError(false);
    } catch {
      setDbError(true);
      notify('本机存储不可用，请检查浏览器存储权限；曲目仍可导出');
    }
  }, [notify]);
  const refreshCatalog = useCallback(async () => {
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'scores/catalog.json');
      if (!response.ok) throw new Error('曲库加载失败');
      const cacheResponse = response.clone();
      const entries: unknown = await response.json();
      if (
        !Array.isArray(entries) ||
        entries.length > 2000 ||
        entries.some(
          (e) =>
            !e ||
            typeof e.id !== 'string' ||
            typeof e.title !== 'string' ||
            typeof e.artist !== 'string' ||
            typeof e.file !== 'string' ||
            /[\\/]/.test(e.file) ||
            !/\.(webfret\.json|gp[345]?|gpx)$/i.test(e.file) ||
            !['guitar', 'ukulele-high', 'ukulele-low'].includes(e.instrument) ||
            !Number.isInteger(e.measureCount) ||
            e.measureCount < 1,
        )
      )
        throw new Error('曲库索引无效');
      setCatalog(entries as CatalogEntry[]);
      setCatalogError(false);
      if ('caches' in window)
        void caches
          .open('webfret-catalog-v1')
          .then((cache) =>
            cache.put(import.meta.env.BASE_URL + 'scores/catalog.json', cacheResponse),
          )
          .catch(() => undefined);
    } catch {
      setCatalogError(true);
    }
  }, []);
  useEffect(() => {
    void refreshDocs();
    void refreshCatalog();
    const handler = () => {
      setHash(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handler);
    return () => {
      window.removeEventListener('hashchange', handler);
      clearTimeout(toastTimer.current);
    };
  }, [refreshDocs, refreshCatalog]);
  const parts = hash.replace(/^#\/?/, '').split('/');
  const isSong = ['play', 'edit'].includes(parts[0]);
  const editing = parts[0] === 'edit';
  const repo = parts[1] === 'repo';
  const routeId = parts[2];
  const onlyMine = hash === '#/mine';
  useEffect(() => {
    let active = true;
    if (!isSong || !routeId) {
      setDoc(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      setDoc(null);
      try {
        if (repo) {
          const entry = catalog.find((e) => e.id === routeId);
          if (!entry) {
            if (!catalogError && !catalog.length) return;
            throw new Error('仓库中没有这首曲目');
          }
          const response = await fetch(
            import.meta.env.BASE_URL + 'scores/' + encodeURIComponent(entry.file),
          );
          if (!response.ok) throw new Error('曲目无法加载。断网时请从“我的曲目”打开已收藏的版本');
          const blob = await response.blob();
          if (blob.size > MAX_DOCUMENT_BYTES) throw new Error('曲目文件过大');
          const imported = await importFile(new File([blob], entry.file));
          imported[0].id = 'repo-' + entry.id;
          if (active) setDoc(imported[0]);
        } else {
          const saved = await storage.get(decodeURIComponent(routeId));
          if (!saved) throw new Error('本机中没有这首曲目');
          if (active) setDoc(saved);
        }
      } catch (error) {
        if (active) {
          notify(error instanceof Error ? error.message : '曲目加载失败');
          navigate('#/');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [isSong, routeId, repo, catalog, catalogError, notify]);
  const save = useCallback(
    async (next: WebFretDocument) => {
      try {
        await storage.save(next);
        setDocs((current) =>
          [next, ...current.filter((d) => d.id !== next.id)].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          ),
        );
        setDbError(false);
      } catch (error) {
        setDbError(true);
        notify('保存失败，可能是存储空间不足；请先导出当前曲目备份');
        throw error;
      }
    },
    [notify],
  );
  function open(id: string, fromRepo: boolean, edit = false): void {
    navigate(
      `#/${edit ? 'edit' : 'play'}/${fromRepo ? 'repo' : 'local'}/${encodeURIComponent(id)}`,
    );
  }
  async function create(instrument: Instrument, title: string, notation: 'editable' | SourceVersion['notation']): Promise<void> {
    try {
      const next = notation === 'editable' ? createDocument(instrument, title) : createSourceDocument(instrument, title, notation);
      await save(next);
      open(next.id, false, true);
    } catch (error) {
      notify(error instanceof Error ? error.message : '新建曲目失败，请重试');
    }
  }
  async function copy(source: WebFretDocument, edit: boolean): Promise<void> {
    try {
      const next = copyDocument(source);
      await save(next);
      open(next.id, false, edit);
      notify(edit ? '已建立本机副本，可以开始编辑' : '已收藏到本机，断网也能继续练习');
    } catch (error) {
      notify(error instanceof Error ? error.message : '曲目复制失败，请重试');
    }
  }
  function pickFile(mode: 'import' | 'restore'): void {
    setFileMode(mode);
    if (fileInput.current) {
      fileInput.current.value = '';
      fileInput.current.click();
    }
  }
  async function receiveFile(file: File): Promise<void> {
    setLoading(true);
    setFileError(null);
    try {
      const imported = await importFile(file, fileMode === 'restore');
      if (fileMode === 'restore') setRestorePreview(imported);
      else {
        await save(imported[0]);
        open(imported[0].id, false);
        notify('曲目已导入并保存到本机');
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '文件导入失败');
    } finally {
      setLoading(false);
    }
  }
  async function backup(): Promise<void> {
    try {
      await storage.flush();
      const current = await storage.list();
      if (!current.length) {
        notify('还没有本机曲目可以备份');
        return;
      }
      const count = exportBackup(current);
      notify(
        count > 1
          ? `曲库较大，已分为 ${count} 份备份；恢复时依次导入各份文件`
          : '本机曲库备份已导出',
      );
    } catch {
      notify('无法读取本机曲库，请检查存储权限');
    }
  }
  return (
    <div className={`app-shell ${isSong && doc?.score.kind !== 'source' ? 'has-transport' : ''}`}>
      <aside className="sidebar">
        <a className="brand" href="#/">
          <img src={import.meta.env.BASE_URL + 'icons/logo.svg'} alt="" />
          <div>
            <b>
              WebFret<span>·</span>
            </b>
            <small>你的随身练琴本</small>
          </div>
        </a>
        <div className="sidebar-caption">我的音乐空间</div>
        <nav>
          <a className={!isSong && !onlyMine ? 'active' : ''} href="#/">
            <Icon name="library" />
            曲谱与练习<span>→</span>
          </a>
          <a className={onlyMine ? 'active' : ''} href="#/mine">
            <Icon name="music" />
            我的曲目<span className="nav-count">{docs.length}</span>
          </a>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-caption">把音乐带走</div>
        <button className="sidebar-action" onClick={() => void backup()}>
          <Icon name="download" />
          备份本机曲库
        </button>
        <button className="sidebar-action" onClick={() => pickFile('restore')}>
          <Icon name="upload" />
          恢复曲库备份
        </button>
        <button className="sidebar-action" onClick={() => setInstallHelp(true)}>
          <Icon name="plus" />
          添加到桌面
        </button>
        <div className="sidebar-note">
          <div className="note-top">
            <Icon name="guitar" size={22} />
            <span>练琴小记</span>
          </div>
          <p>
            不急着弹完整首。
            <br />
            先把眼前的两小节，
            <br />
            弹得轻松又自在。
          </p>
          <span className="note-stroke" />
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          {pwa.ready ? '离线资源已就绪' : '离线资源准备中'}
          <small>MADE FOR YOUR MUSIC</small>
        </div>
      </aside>
      <div className="main-shell">
        <div className="app-topbar">
          <a className="mobile-brand" href="#/">
            <img src={import.meta.env.BASE_URL + 'icons/logo.svg'} alt="" />
            WebFret
          </a>
          <span className="topbar-breadcrumb">
            我的音乐空间 <span>/</span>{' '}
            {isSong ? (editing ? doc?.score.kind === 'source' ? '原谱录入' : '基础制谱' : '读谱与练习') : onlyMine ? '我的曲目' : '曲谱与练习'}
          </span>
          <div
            className={`network-badge ${pwa.ready ? 'ready' : ''}`}
            title={pwa.error ? '离线缓存未成功，当前仍可联网使用' : undefined}
          >
            <Icon name={pwa.ready ? 'cloud' : 'wifi'} size={16} />
            {pwa.ready
              ? pwa.online
                ? '可离线使用'
                : '正在离线使用'
              : pwa.online
                ? '联网使用中'
                : '已断网'}
          </div>
        </div>
        {dbError && (
          <div className="app-alert" role="alert">
            本机保存暂不可用。请导出重要作品，并检查浏览器存储空间或权限。
          </div>
        )}
        {pwa.needRefresh && (
          <div className="update-banner">
            <span>新版本已准备好，可在练习结束后更新。</span>
            <button className="small-btn" onClick={() => setUpdateConfirm(true)}>
              更新
            </button>
          </div>
        )}
        <main>
          {isSong ? (
            doc ? (
              doc.score.kind === 'source' ? <SourceSong
                key={doc.id}
                initial={doc}
                repo={repo}
                editing={editing}
                back={() => navigate('#/')}
                toggleEdit={() => open(doc.id, false, !editing)}
                copy={copy}
                save={save}
                openGenerated={async (next) => { await save(next); open(next.id, false); notify('已保存独立练习副本；可以试听和编辑建议指法'); }}
                notify={notify}
              /> : <Song
                key={doc.id}
                initial={doc}
                repo={repo}
                editing={editing}
                back={() => navigate('#/')}
                toggleEdit={() => open(doc.id, false, !editing)}
                copy={copy}
                save={save}
                notify={notify}
              />
            ) : (
              <div className="page-loading">
                <span className="spinner" />
                正在打开曲目…
              </div>
            )
          ) : (
            <Library
              docs={docs}
              catalog={catalog}
              onlyMine={onlyMine}
              catalogError={catalogError}
              open={open}
              create={(instrument, title, notation) => void create(instrument, title, notation)}
              import={() => pickFile('import')}
              remove={(target) => {
                void storage
                  .remove(target.id)
                  .then(refreshDocs)
                  .then(() => notify('本机曲目已删除'))
                  .catch(() => notify('删除失败，请重试'));
              }}
              retryCatalog={() => void refreshCatalog()}
            />
          )}
        </main>
        <nav className="mobile-nav">
          <a className={!onlyMine && !isSong ? 'active' : ''} href="#/">
            <Icon name="library" size={19} />
            曲库
          </a>
          <a className={onlyMine ? 'active' : ''} href="#/mine">
            <Icon name="music" size={19} />
            我的曲目
          </a>
          <button onClick={() => setBackupHelp(true)}>
            <Icon name="download" size={19} />
            备份
          </button>
          <button onClick={() => setInstallHelp(true)}>
            <Icon name="plus" size={19} />
            安装
          </button>
        </nav>
      </div>
      <input
        ref={fileInput}
        className="file-input"
        type="file"
        accept=".json,.gp,.gp3,.gp4,.gp5,.gpx"
        aria-label="导入曲目文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void receiveFile(file);
        }}
      />
      {fileError && (
        <Modal title="导入未完成" onClose={() => setFileError(null)}>
          <p>{fileError}</p>
          <p className="muted">本机曲库未被本次失败的导入修改。请检查文件格式或大小后重试。</p>
          <button className="button primary full" onClick={() => setFileError(null)}>
            知道了
          </button>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="music" size={17} />
          <span>{toast}</span>
          <button className="icon-btn" aria-label="关闭提示" onClick={() => setToast('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {loading && (
        <div className="busy-pill">
          <span className="spinner" />
          正在处理曲目…
        </div>
      )}
      {installHelp && (
        <Modal title="把练琴本带在身边" onClose={() => setInstallHelp(false)}>
          <div className="install-logo">
            <img src={import.meta.env.BASE_URL + 'icons/logo.svg'} alt="WebFret" />
          </div>
          <p>添加到桌面后，可以像 App 一样打开 WebFret。</p>
          <div className="install-step">
            <b>Android / 电脑 Chrome、Edge</b>
            <p>打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。</p>
          </div>
          <div className="install-step">
            <b>iPhone Safari</b>
            <p>点分享按钮 →“添加到主屏幕”。请在 Safari 中打开本站。</p>
          </div>
          <p className="helper">
            首次联网准备资源后可离线使用。需要离线练的仓库曲目，请先收藏到本机。
          </p>
        </Modal>
      )}
      {backupHelp && (
        <Modal title="本机曲库备份" onClose={() => setBackupHelp(false)}>
          <p>当前设备保存了 {docs.length} 首曲目。导出后可以在其他设备恢复，或上传 GitHub 保管。</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setBackupHelp(false);
                pickFile('restore');
              }}
            >
              <Icon name="upload" size={17} />
              从备份恢复
            </button>
            <button className="button primary" onClick={() => void backup()}>
              <Icon name="download" size={17} />
              导出备份
            </button>
          </div>
        </Modal>
      )}
      {restorePreview && (
        <Modal title="恢复本机曲库" onClose={() => setRestorePreview(null)}>
          <p>
            备份包含 <b>{restorePreview.length}</b> 首曲目，其中{' '}
            <b>{restorePreview.filter((item) => docs.some((d) => d.id === item.id)).length}</b>{' '}
            首与本机 ID 相同。
          </p>
          <p className="muted">
            恢复会替换相同 ID 的曲目及练习设置，其他本机作品保留。建议先导出当前备份。
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => void backup()}>
              先导出备份
            </button>
            <button
              className="button primary"
              onClick={() => {
                void storage
                  .flush()
                  .then(() => storage.restore(restorePreview))
                  .then(refreshDocs)
                  .then(() => {
                    setRestorePreview(null);
                    navigate('#/mine');
                    notify('曲库已完整恢复');
                  })
                  .catch(() => notify('恢复失败，未完成的恢复已回滚，请检查存储空间'));
              }}
            >
              恢复并替换同 ID 曲目
            </button>
          </div>
        </Modal>
      )}
      {updateConfirm && (
        <Modal title="更新 WebFret" onClose={() => setUpdateConfirm(false)}>
          <p>更新会重新打开应用，当前播放会停止。本机曲目和练习设置会保留。</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setUpdateConfirm(false)}>
              稍后
            </button>
            <button
              className="button primary"
              onClick={() => {
                void storage
                  .flush()
                  .then(() => pwa.update())
                  .catch(() => notify('当前保存未完成，请先导出曲目再更新'));
              }}
            >
              保存完成后更新
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
