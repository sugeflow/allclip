import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clearSaved, savedCount } from '../../src/core/dedup';
import type { BgRequest } from '../../src/core/messages';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../src/core/settings';
import { DEFAULT_FILENAME_TEMPLATE, notePath, trimSlashes } from '../../src/render/filename';
import type { ClipDoc } from '../../src/core/types';

type TestState = { state: 'idle' } | { state: 'testing' } | { state: 'done'; ok: boolean; msg: string };

export function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [test, setTest] = useState<TestState>({ state: 'idle' });
  const [count, setCount] = useState(0);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const flashTimer = useRef<number>();

  useEffect(() => {
    loadSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
    savedCount().then(setCount);
    chrome.commands.getAll().then((cmds) => {
      const map: Record<string, string> = {};
      for (const c of cmds) if (c.name) map[c.name] = c.shortcut || '';
      setShortcuts(map);
    });
  }, []);

  const update = async (patch: Partial<Settings>) => {
    setS((prev) => ({ ...prev, ...patch }));
    await saveSettings(patch);
    if ('restBaseUrl' in patch || 'restApiKey' in patch) setTest({ state: 'idle' });
    setSavedFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1400);
  };

  const runTest = async () => {
    setTest({ state: 'testing' });
    const r = (await chrome.runtime.sendMessage({
      type: 'test-rest',
      baseUrl: s.restBaseUrl,
      apiKey: s.restApiKey,
    } satisfies BgRequest)) as { ok: boolean; msg: string };
    setTest({ state: 'done', ...r });
  };

  const root = trimSlashes(s.rootFolder);
  const rest = s.saveMethod === 'rest';

  if (!loaded) return null;

  return (
    <main class="page">
      <header class="top">
        <div class="brand">
          <span class="brand-seal" aria-hidden="true">收</span>
          <div>
            <h1>AllClip</h1>
            <p>把看到的内容收进 Obsidian</p>
          </div>
        </div>
        <span class={`autosave ${savedFlash ? 'on' : ''}`} aria-live="polite">
          {savedFlash ? '已保存' : '修改自动保存'}
        </span>
      </header>

      <Section n="01" title="怎么存进 Obsidian">
        <div class="methods" role="radiogroup" aria-label="保存方式">
          <Method
            checked={rest}
            onSelect={() => update({ saveMethod: 'rest' })}
            title="Local REST API"
            badge="推荐"
            desc="图片存到本地附件，帖子删了也不怕。需要 Obsidian 开着，并装一个插件。"
          />
          <Method
            checked={!rest}
            onSelect={() => update({ saveMethod: 'uri' })}
            title="obsidian:// 链接"
            desc="零配置，装好就能用。图片保留网络链接，以后可能失效。"
          />
        </div>

        <Row label="仓库名称" hint={rest ? '用于保存后“在 Obsidian 中打开”' : '必填：要存进哪个 Obsidian 仓库'}>
          <input class="field" value={s.vaultName} placeholder="例如 Library" onChange={(e) => update({ vaultName: val(e) })} />
        </Row>

        {rest && (
          <>
            <Row label="API Key" hint="Obsidian → 设置 → Local REST API → 复制 API Key">
              <input
                class="field mono"
                type="password"
                value={s.restApiKey}
                placeholder="粘贴 API Key"
                autocomplete="off"
                onChange={(e) => update({ restApiKey: val(e) })}
              />
            </Row>
            <Row label="地址" hint="默认用插件的 HTTP 端口，需在插件里打开“Enable Non-encrypted (HTTP) Server”">
              <input class="field mono" value={s.restBaseUrl} onChange={(e) => update({ restBaseUrl: val(e) })} />
            </Row>
            <div class="test">
              <button class="btn" disabled={!s.restApiKey || test.state === 'testing'} onClick={runTest}>
                {test.state === 'testing' ? '正在连接…' : '测试连接'}
              </button>
              {test.state === 'done' && <span class={`test-msg ${test.ok ? 'ok' : 'bad'}`}>{test.msg}</span>}
            </div>
            <details class="guide">
              <summary>第一次用？三步装好插件</summary>
              <ol>
                <li>Obsidian → 设置 → 第三方插件 → 浏览，搜索 <b>Local REST API</b>，安装并启用。</li>
                <li>在插件设置里打开 <b>Enable Non-encrypted (HTTP) Server</b>（端口 27123）。</li>
                <li>复制插件页面上的 <b>API Key</b>，粘贴到上面，点“测试连接”。</li>
              </ol>
            </details>
          </>
        )}
      </Section>

      <Section n="02" title="存在哪里">
        <Row label="根文件夹" hint="仓库里的文件夹名，不存在会自动创建">
          <input class="field mono" value={s.rootFolder} onChange={(e) => update({ rootFolder: trimSlashes(val(e)) })} />
        </Row>
        <pre class="tree mono" aria-label="目录结构预览">
{`${root}/
├─ X/            2026-10-02 @作者 标题.md
├─ 小红书/
├─ 知乎/
├─ Reddit/
├─ 公众号/
├─ Web/
└─ _assets/      图片和视频`}
        </pre>
      </Section>

      <Section n="03" title="存哪些内容">
        <Toggle
          checked={s.saveImagesLocal && rest}
          disabled={!rest}
          onChange={(v) => update({ saveImagesLocal: v })}
          label="图片下载到本地"
          hint={rest ? '存进 _assets 文件夹，笔记里用 ![[ ]] 引用' : '只有 Local REST API 方式能存本地图片'}
        />
        <Toggle
          checked={s.downloadVideoByDefault}
          disabled={!rest}
          onChange={(v) => update({ downloadVideoByDefault: v })}
          label="默认下载视频"
          hint="关闭时，可以在保存弹窗里单次勾选"
        />
        <Row label="视频大小上限" inline>
          <NumberInput value={s.videoMaxMB} min={10} max={2000} suffix="MB" onChange={(v) => update({ videoMaxMB: v })} />
        </Row>
        <Row label="Reddit 评论" hint="按得分保存最高的几条一级评论，0 表示不存" inline>
          <NumberInput value={s.redditTopComments} min={0} max={100} suffix="条" onChange={(v) => update({ redditTopComments: v })} />
        </Row>
        <Toggle checked={s.openAfterSave} onChange={(v) => update({ openAfterSave: v })} label="保存后自动在 Obsidian 中打开" />
        <Toggle
          checked={s.showInlineButton}
          onChange={(v) => update({ showInlineButton: v })}
          label="在页面里显示“收录”按钮"
          hint="推文操作栏、小红书笔记互动栏旁边，点一下直接保存"
        />
      </Section>

      <Section n="04" title="笔记格式">
        <Row label="文件名" hint="可用 {date} {author} {title} {platform} {id}">
          <input
            class="field mono"
            value={s.filenameTemplate}
            placeholder={DEFAULT_FILENAME_TEMPLATE}
            onChange={(e) => update({ filenameTemplate: val(e).trim() || DEFAULT_FILENAME_TEMPLATE })}
          />
        </Row>
        <p class="preview mono">{notePath(SAMPLE, root, undefined, s.filenameTemplate)}.md</p>
        <Row label="status 字段" hint="新笔记 frontmatter 里的 status，方便在 Obsidian 里筛“待读”">
          <input class="field mono" value={s.statusValue} placeholder="inbox" onChange={(e) => update({ statusValue: val(e).trim() || 'inbox' })} />
        </Row>
        <Row label="默认标签" hint="每篇笔记都加上，用空格分隔">
          <input
            class="field"
            value={s.extraTags.join(' ')}
            placeholder="例如 剪藏 待整理"
            onChange={(e) => update({ extraTags: val(e).split(/[\s,，]+/).filter(Boolean) })}
          />
        </Row>
      </Section>

      <Section n="05" title="快捷键">
        <div class="keys">
          <div class="key-row">
            <span>一键保存，不打开弹窗</span>
            <kbd>{fmtKey(shortcuts['quick-save'])}</kbd>
          </div>
          <div class="key-row">
            <span>打开保存弹窗</span>
            <kbd>{fmtKey(shortcuts['_execute_action'])}</kbd>
          </div>
          <div class="key-row">
            <span>弹窗里保存</span>
            <kbd>⌘ ↵</kbd>
          </div>
        </div>
        <button class="btn ghost link" onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
          修改快捷键 →
        </button>
      </Section>

      <Section n="06" title="收录记录">
        <div class="records">
          <span>
            已收录 <b>{count}</b> 篇。同一篇再次保存时会更新原笔记，不会重复。
          </span>
          <button
            class="btn"
            disabled={!count}
            onClick={async () => {
              if (!confirm('清空收录记录？Obsidian 里的笔记不会被删除，只是之后再存同一篇会新建一份。')) return;
              await clearSaved();
              setCount(0);
            }}
          >
            清空记录
          </button>
        </div>
      </Section>
    </main>
  );
}

// ---------- 组件 ----------

function Section({ n, title, children }: { n: string; title: string; children: ComponentChildren }) {
  return (
    <section class="section">
      <h2>
        <span class="num mono">{n}</span>
        {title}
      </h2>
      <div class="section-body">{children}</div>
    </section>
  );
}

function Row({ label, hint, inline, children }: { label: string; hint?: string; inline?: boolean; children: ComponentChildren }) {
  return (
    <label class={`row ${inline ? 'inline' : ''}`}>
      <span class="row-label">
        {label}
        {hint && <span class="row-hint">{hint}</span>}
      </span>
      <span class="row-control">{children}</span>
    </label>
  );
}

function Method(p: { checked: boolean; onSelect(): void; title: string; desc: string; badge?: string }) {
  return (
    <button role="radio" aria-checked={p.checked} class={`method ${p.checked ? 'on' : ''}`} onClick={p.onSelect}>
      <span class="radio" aria-hidden="true" />
      <span class="method-title">
        {p.title}
        {p.badge && <span class="badge">{p.badge}</span>}
      </span>
      <span class="method-desc">{p.desc}</span>
    </button>
  );
}

function Toggle(p: { checked: boolean; disabled?: boolean; onChange(v: boolean): void; label: string; hint?: string }) {
  return (
    <label class={`toggle ${p.disabled ? 'disabled' : ''}`}>
      <span class="row-label">
        {p.label}
        {p.hint && <span class="row-hint">{p.hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={p.checked}
        disabled={p.disabled}
        onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)}
      />
    </label>
  );
}

function NumberInput(p: { value: number; min: number; max: number; suffix: string; onChange(v: number): void }) {
  return (
    <span class="num-input">
      <input
        class="field mono"
        type="number"
        value={p.value}
        min={p.min}
        max={p.max}
        onChange={(e) => {
          const v = Math.round(Number(val(e)));
          if (Number.isFinite(v)) p.onChange(Math.min(p.max, Math.max(p.min, v)));
        }}
      />
      <span>{p.suffix}</span>
    </span>
  );
}

const val = (e: Event) => (e.target as HTMLInputElement).value;

/** 文件名预览用的示例 */
const SAMPLE: ClipDoc = {
  platform: 'x',
  kind: 'post',
  id: '1843000000000000000',
  url: '',
  title: '关于大模型训练的一些想法',
  author: { name: 'Andrej Karpathy', handle: '@karpathy' },
  published: '2026-10-02T08:00:00Z',
  tags: [],
  body: '',
  media: [],
  source: 'intercept',
};

function fmtKey(k?: string): string {
  if (!k) return '未设置';
  return k.replace(/Alt|⌥/g, '⌥ ').replace(/Shift|⇧/g, '⇧ ').replace(/Command|⌘/g, '⌘ ').replace(/\+/g, '').trim();
}
