import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BgRequest, PreviewResult, SaveResult } from '../../src/core/messages';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../../src/core/settings';
import { PLATFORM_LABEL, type ClipDoc } from '../../src/core/types';
import { notePath, titleOf, ymd } from '../../src/render/filename';

type Phase =
  | { name: 'loading' }
  | { name: 'error'; text: string; unsupported: boolean }
  | { name: 'ready' }
  | { name: 'saving' }
  | { name: 'saved'; res: Extract<SaveResult, { ok: true }> }
  | { name: 'save-error'; res: Extract<SaveResult, { ok: false }> };

const send = <T,>(msg: BgRequest) => chrome.runtime.sendMessage(msg) as Promise<T>;

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }>>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tabId, setTabId] = useState<number>();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [video, setVideo] = useState(false);
  const [comments, setComments] = useState(false);
  const [onlySelection, setOnlySelection] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) return setPhase({ name: 'error', text: '找不到当前标签页', unsupported: true });
      setTabId(tab.id);
      const r = await send<PreviewResult>({ type: 'preview', tabId: tab.id });
      if (!r.ok) return setPhase({ name: 'error', text: r.error, unsupported: r.code === 'unsupported' });
      setPreview(r);
      setTitle(titleOf(r.doc));
      setVideo(s.downloadVideoByDefault);
      setComments(r.doc.platform === 'reddit' && s.redditTopComments > 0);
      setOnlySelection(!!r.selection);
      setPhase({ name: 'ready' });
    })().catch((e) => setPhase({ name: 'error', text: String(e?.message || e), unsupported: false }));
  }, []);

  const save = async (methodOverride?: 'uri') => {
    if (!preview || tabId == null) return;
    setPhase({ name: 'saving' });
    const res = await send<SaveResult>({
      type: 'save',
      tabId,
      doc: preview.doc,
      methodOverride,
      options: {
        title,
        tags: tags.split(/[\s,，]+/).filter(Boolean),
        note,
        downloadVideo: video,
        includeComments: comments,
        selection: onlySelection ? preview.selection : undefined,
      },
    });
    setPhase(res.ok ? { name: 'saved', res } : { name: 'save-error', res });
  };

  // ⌘/Ctrl + Enter 保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phase.name === 'ready') void save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div class="popup">
      <Header />
      {phase.name === 'loading' && <Skeleton />}
      {phase.name === 'error' && <ErrorState text={phase.text} unsupported={phase.unsupported} />}
      {preview && (phase.name === 'ready' || phase.name === 'saving' || phase.name === 'save-error') && (
        <Editor
          p={preview}
          settings={settings}
          title={title}
          setTitle={setTitle}
          tags={tags}
          setTags={setTags}
          note={note}
          setNote={setNote}
          video={video}
          setVideo={setVideo}
          comments={comments}
          setComments={setComments}
          onlySelection={onlySelection}
          setOnlySelection={setOnlySelection}
          saving={phase.name === 'saving'}
          error={phase.name === 'save-error' ? phase.res : undefined}
          onSave={save}
        />
      )}
      {preview && phase.name === 'saved' && <Saved doc={preview.doc} title={title} res={phase.res} />}
    </div>
  );
}

function Header() {
  return (
    <header class="head">
      <div class="brand">
        <img class="brand-seal" src="/icon/128.png" alt="" />
        <span class="brand-name">AllClip</span>
      </div>
      <button class="btn ghost icon" title="设置" aria-label="设置" onClick={() => chrome.runtime.openOptionsPage()}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      </button>
    </header>
  );
}

function Skeleton() {
  return (
    <div class="card skeleton" aria-busy="true" aria-label="正在识别页面内容">
      <div class="sk sk-tab" />
      <div class="sk sk-title" />
      <div class="sk sk-title short" />
      <div class="sk sk-line" />
      <div class="sk sk-line" />
      <div class="sk sk-line short" />
    </div>
  );
}

function ErrorState({ text, unsupported }: { text: string; unsupported: boolean }) {
  return (
    <div class="empty">
      <div class="empty-mark" aria-hidden="true">{unsupported ? '—' : '?'}</div>
      <p class="empty-title">{unsupported ? '这一页不能收录' : '没抓到正文'}</p>
      <p class="empty-sub">{text}</p>
    </div>
  );
}

interface EditorProps {
  p: Extract<PreviewResult, { ok: true }>;
  settings: Settings;
  title: string;
  setTitle(v: string): void;
  tags: string;
  setTags(v: string): void;
  note: string;
  setNote(v: string): void;
  video: boolean;
  setVideo(v: boolean): void;
  comments: boolean;
  setComments(v: boolean): void;
  onlySelection: boolean;
  setOnlySelection(v: boolean): void;
  saving: boolean;
  error?: Extract<SaveResult, { ok: false }>;
  onSave(methodOverride?: 'uri'): void;
}

function Editor(props: EditorProps) {
  const { p, settings, title } = props;
  const doc = p.doc;
  const images = doc.media.filter((m) => m.kind === 'image' || m.kind === 'live-photo');
  const hasVideo = doc.media.some((m) => m.kind === 'video' || m.kind === 'gif');
  const commentCount = doc.comments?.length || 0;
  const isExcerpt = props.onlySelection && !!p.selection;
  const path = useMemo(() => {
    if (isExcerpt) return notePath(doc, settings.rootFolder, `${(title || titleOf(doc)).replace(/（摘录）$/, '')}（摘录）`, settings.filenameTemplate);
    return p.saved ? p.saved.path : notePath(doc, settings.rootFolder, title || titleOf(doc), settings.filenameTemplate);
  }, [p, settings.rootFolder, title, isExcerpt]);
  const selChars = p.selection ? p.selection.replace(/\s+/g, '').length : 0;
  const host = safeHost(doc.url);
  const excerpt = useMemo(() => excerptOf(doc), [doc]);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(titleRef, title);

  return (
    <>
      {!p.configured && (
        <button class="notice warn" onClick={() => chrome.runtime.openOptionsPage()}>
          <strong>还没连接 Obsidian</strong>
          <span>去设置 →</span>
        </button>
      )}
      {doc.platform === 'xiaohongshu' && settings.saveMethod === 'uri' && doc.media.length > 0 && (
        <button class="notice" onClick={() => chrome.runtime.openOptionsPage()}>
          <span>小红书的图片链接会过期，用 obsidian:// 方式只能存链接。建议改用 Local REST API，图片存到本地 →</span>
        </button>
      )}
      {typeof doc.extra?.hint === 'string' && (
        <div class="notice">
          <span>{doc.extra.hint}</span>
        </div>
      )}
      {p.saved && !isExcerpt && (
        <div class="notice">
          <strong>{relDay(p.saved.savedAt)}收录过</strong>
          <span>再存会更新正文，保留你的备注</span>
        </div>
      )}

      <article class="card">
        <div class="card-tab">
          <span class="plat">{PLATFORM_LABEL[doc.platform]}</span>
          <span class="dot">·</span>
          <span class="host">{host}</span>
        </div>
        <textarea
          ref={titleRef}
          class="title-input"
          rows={1}
          value={title}
          aria-label="标题"
          onInput={(e) => props.setTitle((e.target as HTMLTextAreaElement).value)}
        />
        <div class="meta">
          {[
            doc.author.handle || doc.author.name,
            doc.published && ymd(doc.published),
            typeof doc.extra?.thread_length === 'number' ? `线程 ${doc.extra.thread_length} 条` : doc.kind === 'article' ? '长文' : '',
            images.length ? `${images.length} 张图` : '',
            hasVideo ? '含视频' : '',
          ]
            .filter(Boolean)
            .map((t, i) => (
              <span key={i}>{t}</span>
            ))}
        </div>
        {excerpt && <p class="excerpt">{excerpt}</p>}
        {images.length > 0 && (
          <div class="thumbs">
            {images.slice(0, 4).map((m, i) => (
              <div class="thumb" key={m.url}>
                <img src={m.url} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {i === 3 && images.length > 4 && <span class="more">+{images.length - 4}</span>}
              </div>
            ))}
          </div>
        )}
      </article>

      <div class="form">
        <input
          class="field"
          value={props.tags}
          placeholder="标签，用空格分隔"
          aria-label="标签"
          onInput={(e) => props.setTags((e.target as HTMLInputElement).value)}
        />
        <textarea
          class="field"
          rows={2}
          value={props.note}
          placeholder="写点想法，会放在笔记底部「我的备注」"
          aria-label="备注"
          onInput={(e) => props.setNote((e.target as HTMLTextAreaElement).value)}
        />
        {p.selection && (
          <label class="check selection">
            <input type="checkbox" checked={props.onlySelection} onChange={(e) => props.setOnlySelection((e.target as HTMLInputElement).checked)} />
            只存选中的部分（{selChars} 字），存成单独的摘录笔记
          </label>
        )}
        {(hasVideo || commentCount > 0) && !isExcerpt && (
          <div class="checks">
            {hasVideo && (
              <label class="check">
                <input type="checkbox" checked={props.video} onChange={(e) => props.setVideo((e.target as HTMLInputElement).checked)} />
                下载视频
              </label>
            )}
            {commentCount > 0 && (
              <label class="check">
                <input type="checkbox" checked={props.comments} onChange={(e) => props.setComments((e.target as HTMLInputElement).checked)} />
                带评论（{commentCount} 条）
              </label>
            )}
          </div>
        )}
      </div>

      {props.error && (
        <div class="notice error" role="alert">
          <strong>没存上</strong>
          <span>{props.error.error}</span>
          {props.error.code === 'rest-unreachable' && settings.vaultName && (
            <button class="btn" onClick={() => props.onSave('uri')}>
              这次改用 URI 方式保存
            </button>
          )}
          {props.error.code === 'not-configured' && (
            <button class="btn" onClick={() => chrome.runtime.openOptionsPage()}>
              去设置
            </button>
          )}
        </div>
      )}

      <footer class="foot">
        <div class="path mono" title={path + '.md'}>
          <span class="path-dir">{path.slice(0, path.lastIndexOf('/') + 1)}</span>
          <span class="path-name">{path.slice(path.lastIndexOf('/') + 1)}.md</span>
        </div>
        <button class="btn primary save" disabled={props.saving || !p.configured} onClick={() => props.onSave()}>
          {props.saving ? (
            <>
              <span class="spinner" aria-hidden="true" />
              正在收录
            </>
          ) : (
            <>
              {isExcerpt ? '摘录到 Obsidian' : p.saved ? '更新到 Obsidian' : '收录到 Obsidian'}
              <span class="kbd">⌘↵</span>
            </>
          )}
        </button>
      </footer>
    </>
  );
}

function Saved({ doc, title, res }: { doc: ClipDoc; title: string; res: Extract<SaveResult, { ok: true }> }) {
  return (
    <div class="saved">
      <div class="saved-card card">
        <div class="stamp" aria-hidden="true">
          收录
        </div>
        <div class="card-tab">
          <span class="plat">{PLATFORM_LABEL[doc.platform]}</span>
        </div>
        <h1 class="saved-title">{title}</h1>
        <p class="path mono">{res.path}.md</p>
        <p class="saved-sub">
          {res.updated ? '已更新这篇笔记' : '已存进 Obsidian'}
          {res.images.total > 0 && ` · 图片 ${res.images.saved}/${res.images.total} 已存本地`}
        </p>
      </div>
      <div class="saved-actions">
        <button class="btn" onClick={() => window.close()}>
          关闭
        </button>
        <button
          class="btn primary"
          onClick={async () => {
            await send({ type: 'open-in-obsidian', url: res.openUrl });
            window.close();
          }}
        >
          在 Obsidian 中打开
        </button>
      </div>
    </div>
  );
}

// ---------- 小工具 ----------

function useAutosize(ref: { current: HTMLTextAreaElement | null }, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function excerptOf(doc: ClipDoc): string {
  const src = doc.description || doc.body;
  return [...src.replace(/\{\{media:\d+\}\}/g, ' ').replace(/[#>*_`~|[\]()!]/g, ' ').replace(/\s+/g, ' ').trim()]
    .slice(0, 140)
    .join('');
}

function relDay(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
