# Web UI Design Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Hearsay web UI from a generic dark-mode dashboard into a distinctive, crafted engineering tool with strong typographic identity, refined color palette, polished interactions, and missing spec features.

**Architecture:** Pure frontend changes — no backend modifications. All changes are in `web/`. The CSS is a single `index.css` file (no CSS modules/Tailwind). Components are React + react-router-dom. The app is served from Hearsay server on port 7432, dev proxy configured in vite.

**Tech Stack:** React 19, react-router-dom 7, Vite 7, plain CSS with custom properties. No animation libraries — CSS-only transitions and keyframes. Google Fonts loaded via `<link>` tags.

**Running the app:** The server is already running on port 7432. For dev: `cd web && bun run dev`. To rebuild production: `cd web && bun run build`.

**Verification:** After each task, visually verify at `http://localhost:7432` (production build) or the Vite dev server. Run `cd /home/ubuntu/hearsay/web && bun run build` to verify no build errors.

---

### Task 1: Typography & Color Foundation

Replaces the entire CSS variable system and font stack. This is the foundation all other tasks build on.

**Files:**
- Modify: `web/index.html` (font links, page title)
- Modify: `web/src/index.css:1-33` (CSS variables, body font)

**Step 1: Update index.html**

Add Google Fonts links and fix the page title:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hearsay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Replace CSS variables and base styles**

Replace lines 1-33 of `web/src/index.css` with:

```css
:root {
  --bg: #111113;
  --bg-surface: #191a1e;
  --bg-card: #1e1f24;
  --bg-hover: #26272d;
  --bg-input: #141416;
  --text: #ececef;
  --text-muted: #87888d;
  --text-dim: #55565b;
  --accent: #e8a855;
  --accent-hover: #f0bc72;
  --accent-glow: rgba(232, 168, 85, 0.15);
  --border: #2a2b30;
  --border-subtle: #222328;
  --status-active: #66bb6a;
  --status-archived: #87888d;
  --status-obsolete: #ef5350;
  --tag-bg: #28291f;
  --tag-text: #e8a855;
  --font-sans: 'Instrument Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'SF Mono', 'Consolas', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); }

.mono { font-family: var(--font-mono); font-size: 0.85em; }
```

**Step 3: Update all `var(--mono)` references in CSS**

Search for `var(--mono)` in index.css and replace with `var(--font-mono)`. Affected lines:
- `.mono` class (line 33) — already handled above
- `.breadcrumb` (line 143)
- `.tag` (line 219)
- `.card-files` (line 222)
- `.form-group textarea` (line 330)

Replace all occurrences of `font-family: var(--mono)` with `font-family: var(--font-mono)` throughout the file.

**Step 4: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add web/index.html web/src/index.css
git commit -m "feat(web): new typography (Instrument Sans + IBM Plex Mono) and warm dark palette"
```

---

### Task 2: Background Texture & Header Redesign

Adds noise texture overlay for depth, redesigns the header with monospace branding and command-palette-style search.

**Files:**
- Modify: `web/src/index.css:36-76` (header styles)
- Modify: `web/src/App.tsx:21-32` (header markup)

**Step 1: Add noise texture overlay**

Add this at the very end of `web/src/index.css` (after the last rule):

```css
/* Noise texture overlay */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 9999;
}
```

**Step 2: Replace header styles**

Replace the header CSS block (`.header` through `.search-box input:focus`) with:

```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  height: 48px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  position: relative;
}

.header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 15%;
  right: 15%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0.4;
}

.header h1 {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: lowercase;
}

.header h1 a { color: var(--text); }
.header h1 a:hover { color: var(--accent); }

.search-box {
  display: flex;
  align-items: center;
}

.search-box input {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  padding-right: 3rem;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  width: 240px;
  outline: none;
  transition: width 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-box input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
  width: 300px;
}

.search-box {
  position: relative;
}

.search-hint {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.1rem 0.35rem;
  pointer-events: none;
  line-height: 1;
}
```

**Step 3: Update header markup in App.tsx**

In `web/src/App.tsx`, update the header JSX (inside the `<header className="header">`) to:

```tsx
<header className="header">
  <h1><Link to="/">hearsay</Link></h1>
  <form className="search-box" onSubmit={handleSearch}>
    <input
      placeholder="Search posts..."
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
    />
    <span className="search-hint">/</span>
  </form>
</header>
```

**Step 4: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add web/src/index.css web/src/App.tsx
git commit -m "feat(web): noise texture overlay, redesigned header with accent line and search hint"
```

---

### Task 3: Sidebar Refinement

Adds vertical guide lines, smooth chevron toggles, active highlight bar, and pill-style post count badges.

**Files:**
- Modify: `web/src/index.css:84-132` (sidebar styles)
- Modify: `web/src/components/Sidebar.tsx` (markup changes)

**Step 1: Replace sidebar CSS**

Replace the entire `/* Sidebar */` section (from `.sidebar` through `.tree-children`) with:

```css
/* Sidebar */
.sidebar {
  width: 230px;
  min-width: 230px;
  border-right: 1px solid var(--border);
  background: var(--bg-surface);
  overflow-y: auto;
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
}

.sidebar-tree { flex: 1; padding-top: 0.25rem; }

.sidebar-bottom {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
}

.sidebar-bottom .btn {
  border-style: dashed;
  background: transparent;
  width: 100%;
}

.sidebar-bottom .btn:hover {
  background: var(--accent-glow);
  border-color: var(--accent);
  color: var(--accent);
}

.tree-item {
  display: flex;
  align-items: center;
  padding: 0.3rem 0.75rem 0.3rem 0;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-muted);
  user-select: none;
  position: relative;
  transition: color 0.1s, background 0.1s;
}

.tree-item:hover { background: var(--bg-hover); color: var(--text); }

.tree-item.active {
  color: var(--accent);
  font-weight: 600;
  background: var(--accent-glow);
}

.tree-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent);
}

.tree-toggle {
  width: 1.5rem;
  min-width: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
}

.tree-chevron {
  display: inline-block;
  width: 12px;
  height: 12px;
  transition: transform 0.15s ease;
}

.tree-chevron.expanded {
  transform: rotate(90deg);
}

.tree-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tree-count {
  font-size: 0.65rem;
  color: var(--text-dim);
  background: var(--bg-hover);
  padding: 0.05rem 0.4rem;
  border-radius: 8px;
  margin-left: 0.5rem;
  min-width: 1.2rem;
  text-align: center;
}

.tree-children {
  padding-left: 0.5rem;
  margin-left: 1rem;
  border-left: 1px solid var(--border-subtle);
}
```

**Step 2: Update Sidebar.tsx TreeNode component**

In `web/src/components/Sidebar.tsx`, replace the `TreeNode` function component (lines 47-86) with:

```tsx
function TreeNode({ node, activeTopic }: { node: TopicNode; activeTopic: string }) {
  const navigate = useNavigate();
  const isActive = activeTopic === node.path;
  const isAncestor = activeTopic.startsWith(node.path + '/');
  const [expanded, setExpanded] = useState(isActive || isAncestor);

  useEffect(() => {
    if (isActive || isAncestor) setExpanded(true);
  }, [isActive, isAncestor]);

  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`tree-item ${isActive ? 'active' : ''}`}
        onClick={() => navigate(`/${node.path}/`)}
      >
        <span
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
        >
          {hasChildren ? (
            <svg className={`tree-chevron ${expanded ? 'expanded' : ''}`} viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 3l5 5-5 5V3z" />
            </svg>
          ) : null}
        </span>
        <span className="tree-label">{node.name}</span>
        <span className="tree-count">{node.postCount}</span>
      </div>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} activeTopic={activeTopic} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Update sidebar bottom button**

In the `Sidebar` component's return JSX, change the bottom button from `btn btn-primary` to just `btn`:

```tsx
<div className="sidebar-bottom">
  <button className="btn" onClick={() => navigate('/new')}>
    + New Post
  </button>
</div>
```

**Step 4: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add web/src/index.css web/src/components/Sidebar.tsx
git commit -m "feat(web): sidebar with guide lines, chevron toggles, active highlight bar, pill badges"
```

---

### Task 4: Card Redesign & Browse View Polish

Redesigns cards with left-border status accents, hover lift, staggered entrance animations. Updates folder cards with proper aggregate metadata and folder icon.

**Files:**
- Modify: `web/src/index.css:178-227` (card styles)
- Modify: `web/src/views/BrowseView.tsx` (card markup)

**Step 1: Add keyframe animation at end of index.css**

Add before the noise texture rule (before `/* Noise texture overlay */`):

```css
/* Animations */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.card-animate {
  animation: fadeUp 0.25s ease both;
}
```

**Step 2: Replace card styles**

Replace the entire `/* Cards */` section (from `.card` through `.folder-card .card-title`) with:

```css
/* Cards */
.card {
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--text-dim);
  border-radius: 4px;
  padding: 0.85rem 1.1rem;
  margin-bottom: 0.6rem;
  background: var(--bg-card);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  border-color: var(--border);
}

.card.status-border-active { border-left-color: var(--status-active); }
.card.status-border-archived { border-left-color: var(--status-archived); }
.card.status-border-obsolete { border-left-color: var(--status-obsolete); }

.card-title {
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.card-title-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  font-size: 0.78rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
  margin-top: 0.3rem;
}

.card-tags {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.35rem;
  flex-wrap: wrap;
}

.tag {
  background: var(--tag-bg);
  color: var(--tag-text);
  padding: 0.08rem 0.45rem;
  border-radius: 3px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
}

.card-files {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-top: 0.25rem;
}

.folder-card {
  border-left-color: var(--accent);
  border-left-style: dashed;
}

.folder-card .card-title {
  color: var(--accent);
  font-family: var(--font-mono);
  font-weight: 500;
}

.folder-icon {
  margin-right: 0.35rem;
  opacity: 0.7;
}
```

**Step 3: Update BrowseView.tsx card markup**

In `web/src/views/BrowseView.tsx`, replace the subtopic cards rendering (the `data.subtopics?.map(...)` block, lines 62-75) with:

```tsx
{data.subtopics?.map((st: any, i: number) => (
  <div
    key={st.name}
    className="card folder-card card-animate"
    style={{ animationDelay: `${i * 30}ms` }}
    onClick={() => navigate(`/${cleanTopic ? cleanTopic + '/' : ''}${st.name}/`)}
  >
    <div className="card-title">
      <span className="card-title-text">
        <span className="folder-icon">{'\u{1F4C1}'}</span>
        {st.name}/
      </span>
    </div>
    <div className="card-meta">
      {st.post_count} {st.post_count === 1 ? 'post' : 'posts'} · {st.contributor_count} {st.contributor_count === 1 ? 'contributor' : 'contributors'}
      {st.updated_at && <> · updated {timeAgo(st.updated_at)}</>}
    </div>
    {st.tags?.length > 0 && (
      <div className="card-tags">
        {st.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
      </div>
    )}
  </div>
))}
```

Replace the post cards rendering (the `data.posts?.map(...)` block, lines 77-95) with:

```tsx
{data.posts?.map((p: any, i: number) => (
  <div
    key={p.id}
    className={`card status-border-${p.status} card-animate`}
    style={{ animationDelay: `${(data.subtopics?.length || 0) * 30 + i * 30}ms` }}
    onClick={() => navigate(`/post/${p.id}`)}
  >
    <div className="card-title">
      <span className="card-title-text">{p.title}</span>
      <span className={`status status-${p.status}`}>{p.status}</span>
    </div>
    <div className="card-meta">
      {p.author || 'anonymous'} · {timeAgo(p.updated_at)} · {p.comment_count} {p.comment_count === 1 ? 'comment' : 'comments'}
    </div>
    {p.tags?.length > 0 && (
      <div className="card-tags">
        {p.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
      </div>
    )}
    {p.files?.length > 0 && (
      <div className="card-files">{p.files.join(', ')}</div>
    )}
  </div>
))}
```

**Step 4: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add web/src/index.css web/src/views/BrowseView.tsx
git commit -m "feat(web): redesigned cards with status borders, hover lift, staggered entrance animations"
```

---

### Task 5: Post Detail View Refinement

Restructures metadata layout, adds left-border accent on post body, and polishes the comment section.

**Files:**
- Modify: `web/src/index.css:242-299` (post detail styles)
- Modify: `web/src/views/PostView.tsx` (metadata markup)

**Step 1: Replace post detail CSS**

Replace the entire `/* Post detail */` section (from `.post-detail h1` through `.comment-body`) with:

```css
/* Post detail */
.post-detail h1 {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 1rem;
}

.post-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
}

.post-meta .meta-label {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-top: 0.1rem;
}

.post-meta .meta-value {
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.post-meta .mono { color: var(--text-muted); }

.post-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.post-body {
  line-height: 1.75;
  white-space: pre-wrap;
  margin-bottom: 2rem;
  padding: 1.25rem 0 1.25rem 1.25rem;
  border-left: 2px solid var(--accent);
  margin-left: 0;
}

.comments-header {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
  margin-bottom: 1rem;
}

.comment {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
}

.comment-author {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 0.3rem;
  font-family: var(--font-mono);
}

.comment-author .time {
  font-weight: 400;
  color: var(--text-dim);
}

.comment-body {
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 0.9rem;
}
```

**Step 2: Update PostView.tsx metadata markup**

In `web/src/views/PostView.tsx`, replace the post-meta div (lines 72-80) with:

```tsx
<div className="post-meta">
  <span className="meta-label">status</span>
  <span className="meta-value"><span className={`status status-${post.status}`}>{post.status}</span></span>

  {post.author && <>
    <span className="meta-label">author</span>
    <span className="meta-value">{post.author}</span>
  </>}

  <span className="meta-label">created</span>
  <span className="meta-value">{post.created_at?.slice(0, 10)}</span>

  <span className="meta-label">updated</span>
  <span className="meta-value">{post.updated_at?.slice(0, 10)}</span>

  {post.commit_sha && <>
    <span className="meta-label">commit</span>
    <span className="meta-value">{post.commit_sha}</span>
  </>}

  {post.tags?.length > 0 && <>
    <span className="meta-label">tags</span>
    <span className="meta-value">
      <span className="card-tags" style={{ display: 'inline-flex' }}>
        {post.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
      </span>
    </span>
  </>}

  {post.files?.length > 0 && <>
    <span className="meta-label">files</span>
    <span className="meta-value">{post.files.join(', ')}</span>
  </>}

  {post.contributors?.length > 0 && <>
    <span className="meta-label">contributors</span>
    <span className="meta-value">{post.contributors.join(', ')}</span>
  </>}
</div>
```

**Step 3: Update comment author markup**

In the comments map (line 104), replace the comment-author div:

```tsx
<div className="comment-author">
  {c.author || 'anonymous'} <span className="time">· {timeAgo(c.created_at)}</span>
</div>
```

**Step 4: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add web/src/index.css web/src/views/PostView.tsx
git commit -m "feat(web): post detail with structured metadata grid, accent body border, styled comments"
```

---

### Task 6: Skeleton Loading & Empty States

Replaces "Loading..." text with skeleton card shimmers. Replaces plain empty states with ASCII-style illustrations.

**Files:**
- Create: `web/src/components/Skeleton.tsx`
- Modify: `web/src/index.css` (add skeleton + empty state styles at end)
- Modify: `web/src/views/BrowseView.tsx:33-34` (use skeleton)
- Modify: `web/src/views/PostView.tsx:62` (use skeleton)
- Modify: `web/src/views/BrowseView.tsx:97-99` (empty state)
- Modify: `web/src/views/SearchView.tsx:86-88` (empty state)

**Step 1: Create Skeleton component**

Create `web/src/components/Skeleton.tsx`:

```tsx
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-meta" />
          <div className="skeleton-line skeleton-tags" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ message, actionLabel, onAction }: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <pre className="empty-ascii">{`┌─────────────────────┐
│                     │
│   ${message.padEnd(17)}   │
│                     │
└─────────────────────┘`}</pre>
      {actionLabel && onAction && (
        <button className="btn btn-primary" onClick={onAction} style={{ marginTop: '0.75rem' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

**Step 2: Add skeleton and empty state CSS**

Add to the end of `web/src/index.css` (before the noise texture rule):

```css
/* Skeleton loading */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-card {
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--border);
  border-radius: 4px;
  padding: 0.85rem 1.1rem;
  margin-bottom: 0.6rem;
  background: var(--bg-card);
  animation: fadeUp 0.3s ease both;
}

.skeleton-line {
  height: 0.75rem;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--border) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton-title { width: 55%; margin-bottom: 0.5rem; }
.skeleton-meta { width: 75%; margin-bottom: 0.4rem; height: 0.6rem; }
.skeleton-tags { width: 35%; height: 0.6rem; }

/* Empty states */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 0;
}

.empty-ascii {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-dim);
  line-height: 1.4;
  text-align: center;
}
```

**Step 3: Update BrowseView loading and empty states**

In `web/src/views/BrowseView.tsx`:

Add import at top:
```tsx
import { SkeletonCards, EmptyState } from '../components/Skeleton';
```

Replace the loading return (line 34):
```tsx
if (!data) return <div className="content"><SkeletonCards count={5} /></div>;
```

Replace the empty state (lines 97-99):
```tsx
{!data.subtopics?.length && !data.posts?.length && (
  <EmptyState
    message="nothing here yet"
    actionLabel="+ Create the first post"
    onAction={() => navigate(`/new${cleanTopic ? `?topic=${encodeURIComponent(cleanTopic)}` : ''}`)}
  />
)}
```

**Step 4: Update PostView loading state**

In `web/src/views/PostView.tsx`:

Add import at top:
```tsx
import { SkeletonCards } from '../components/Skeleton';
```

Replace the loading return (line 62):
```tsx
if (!post) return <div className="content"><SkeletonCards count={1} /></div>;
```

**Step 5: Update SearchView empty state**

In `web/src/views/SearchView.tsx`:

Add import at top:
```tsx
import { EmptyState } from '../components/Skeleton';
```

Replace the empty state (lines 86-88):
```tsx
{data && !data.results?.length && (
  <EmptyState message={`no results found`} />
)}
```

**Step 6: Remove old `.empty` and `.loading` CSS**

In `web/src/index.css`, delete the old `.empty` and `.loading` rules (the `/* Utility */` section's `.empty` and `.loading` classes). Keep the `.error` class.

**Step 7: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add web/src/components/Skeleton.tsx web/src/index.css web/src/views/BrowseView.tsx web/src/views/PostView.tsx web/src/views/SearchView.tsx
git commit -m "feat(web): skeleton loading shimmers and ASCII empty states"
```

---

### Task 7: Search View Improvements

Adds bold match highlighting in snippets, match location indicators, and aligns search page styling.

**Files:**
- Modify: `web/src/views/SearchView.tsx` (highlight logic, match location display)
- Modify: `web/src/index.css` (search-related styles)

**Step 1: Update search result card styling**

In `web/src/index.css`, replace the `/* Search results */` section (`.search-header` through `.snippet`) with:

```css
/* Search results */
.search-header {
  margin-bottom: 1.25rem;
}

.search-header h2 {
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.search-header .count {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.snippet {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
  line-height: 1.5;
}

.snippet mark {
  background: var(--accent-glow);
  color: var(--accent);
  border-radius: 2px;
  padding: 0 0.15rem;
  font-weight: 600;
}

.match-location {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-dim);
  background: var(--bg-hover);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}
```

**Step 2: Add highlight helper and update SearchView**

In `web/src/views/SearchView.tsx`, add a helper function before the component:

```tsx
function highlightSnippet(snippet: string, query: string): React.ReactNode {
  if (!snippet || !query) return snippet;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = snippet.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i}>{part}</mark> : part
  );
}
```

Update the result card's snippet and meta lines. Replace the card rendering block (`data?.results?.map(...)`, lines 68-84) with:

```tsx
{data?.results?.map((r: any, i: number) => (
  <div
    key={r.post_id}
    className={`card status-border-${r.status} card-animate`}
    style={{ animationDelay: `${i * 30}ms` }}
    onClick={() => navigate(`/post/${r.post_id}`)}
  >
    <div className="card-title">
      <span className="card-title-text">{r.title}</span>
      <span className={`status status-${r.status}`}>{r.status}</span>
    </div>
    <div className="card-meta">
      <span className="mono">{r.topic}</span>
      {r.match_location && <> · <span className="match-location">{r.match_location}</span></>}
    </div>
    {r.tags?.length > 0 && (
      <div className="card-tags">
        {r.tags.map((t: string) => <span key={t} className="tag">{t}</span>)}
      </div>
    )}
    {r.snippet && <div className="snippet">{highlightSnippet(r.snippet, query)}</div>}
  </div>
))}
```

**Step 3: Add React import for React.ReactNode**

Make sure `React` is importable. At the top of `SearchView.tsx`, ensure the import is:

```tsx
import { useState, useEffect } from 'react';
```

Since we use `React.ReactNode` in the helper, change the return type to use JSX:

Actually, change the helper signature to return `(string | JSX.Element)[]` — or simply don't annotate. The snippet code above already works without explicit `React.ReactNode` since JSX elements are auto-typed.

No change needed — the code as written will work with TypeScript's JSX inference.

**Step 4: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add web/src/index.css web/src/views/SearchView.tsx
git commit -m "feat(web): search results with highlighted snippets and match location badges"
```

---

### Task 8: Form Polish, Button Interactions & Author Identity

Polishes form inputs, adds button press feedback, and implements the localStorage author identity prompt.

**Files:**
- Modify: `web/src/index.css:301-361` (form and button styles)
- Create: `web/src/components/AuthorPrompt.tsx`
- Modify: `web/src/App.tsx` (integrate author prompt)

**Step 1: Replace form and button CSS**

Replace the `/* Forms */` and `/* Buttons */` sections with:

```css
/* Forms */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.35rem;
}

.form-group input,
.form-group textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  color: var(--text);
  font-size: 0.9rem;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.form-group textarea {
  min-height: 150px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.6;
}

/* Buttons */
.btn {
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  user-select: none;
}

.btn:hover { background: var(--bg-hover); border-color: var(--accent); }
.btn:active { transform: scale(0.97); }

.btn-primary {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
  font-weight: 600;
}

.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-primary:active { transform: scale(0.97); }

.btn-danger { color: var(--status-obsolete); }
.btn-danger:hover { border-color: var(--status-obsolete); background: rgba(239, 83, 80, 0.08); }

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

**Step 2: Create AuthorPrompt component**

Create `web/src/components/AuthorPrompt.tsx`:

```tsx
import { useState, useEffect } from 'react';

export function AuthorPrompt() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('hearsay_author');
    if (!stored) setShow(true);
    else setName(stored);
  }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('hearsay_author', trimmed);
    setShow(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setShow(false);
  };

  if (!show) return null;

  return (
    <div className="author-prompt-overlay">
      <div className="author-prompt">
        <h3>who are you?</h3>
        <p>Set a name for your posts and comments. Stored locally.</p>
        <input
          autoFocus
          placeholder="e.g. human:sarah"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="author-prompt-actions">
          <button className="btn" onClick={() => setShow(false)}>Skip</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add AuthorPrompt CSS**

Add to `web/src/index.css` (before `/* Animations */`):

```css
/* Author prompt */
.author-prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeUp 0.2s ease;
}

.author-prompt {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.5rem;
  width: 340px;
  max-width: 90vw;
}

.author-prompt h3 {
  font-family: var(--font-mono);
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: var(--accent);
}

.author-prompt p {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.author-prompt input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  outline: none;
  margin-bottom: 1rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.author-prompt input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.author-prompt-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
```

**Step 4: Integrate AuthorPrompt into App.tsx**

In `web/src/App.tsx`, add import:

```tsx
import { AuthorPrompt } from './components/AuthorPrompt';
```

Add `<AuthorPrompt />` as the first child inside the `.app` div:

```tsx
<div className="app">
  <AuthorPrompt />
  <header className="header">
  ...
```

**Step 5: Verify build**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add web/src/index.css web/src/components/AuthorPrompt.tsx web/src/App.tsx
git commit -m "feat(web): polished forms/buttons with focus glow, author identity prompt on first visit"
```

---

### Task 9: Final Polish & Production Build

Adds content area fade transition, polishes breadcrumb, updates controls styling, and rebuilds the production bundle.

**Files:**
- Modify: `web/src/index.css` (breadcrumb, controls, content transition tweaks)
- Modify: `web/src/views/NewPostView.tsx` (minor form label update)

**Step 1: Update breadcrumb styles**

Replace the `/* Breadcrumb */` section with:

```css
/* Breadcrumb */
.breadcrumb {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 1.25rem;
  letter-spacing: 0.3px;
}

.breadcrumb a {
  color: var(--text-muted);
  transition: color 0.1s;
}

.breadcrumb a:hover { color: var(--accent); }
.breadcrumb span { color: var(--text-dim); margin: 0 0.2rem; }
```

**Step 2: Update controls bar styles**

Replace the `/* Controls bar */` section with:

```css
/* Controls bar */
.controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.controls select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.controls select:focus { border-color: var(--accent); }

.controls label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.controls .spacer { flex: 1; }
```

**Step 3: Update content area for animation**

Replace the `/* Content */` section with:

```css
/* Content */
.content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  animation: fadeUp 0.15s ease;
}
```

**Step 4: Update NewPostView heading**

In `web/src/views/NewPostView.tsx`, change the h2 tag (line 50) to use monospace styling:

```tsx
<h2 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>new post</h2>
```

**Step 5: Build production bundle**

Run: `cd /home/ubuntu/hearsay/web && bun run build`
Expected: Build succeeds. Output in `web/dist/`.

**Step 6: Commit**

```bash
git add web/src/index.css web/src/views/NewPostView.tsx
git commit -m "feat(web): breadcrumb, controls, content transitions polish"
```

**Step 7: Rebuild and verify embedded assets**

If the Hearsay server embeds the web build, restart it to pick up changes:

```bash
cd /home/ubuntu/hearsay && bun run build 2>/dev/null || true
```

Then verify at `http://localhost:7432` that all views render correctly:
- Root topic browser
- Nested topic browsing
- Post detail view
- Search view
- New post form
- Sidebar tree navigation
- Author prompt (clear localStorage first: `localStorage.removeItem('hearsay_author')`)

---

## Summary of All Files Changed

| File | Action | Task |
|------|--------|------|
| `web/index.html` | Modify | 1 |
| `web/src/index.css` | Modify (major) | 1-9 |
| `web/src/App.tsx` | Modify | 2, 8 |
| `web/src/components/Sidebar.tsx` | Modify | 3 |
| `web/src/components/Breadcrumb.tsx` | No changes needed | — |
| `web/src/components/Skeleton.tsx` | Create | 6 |
| `web/src/components/AuthorPrompt.tsx` | Create | 8 |
| `web/src/views/BrowseView.tsx` | Modify | 4, 6 |
| `web/src/views/PostView.tsx` | Modify | 5, 6 |
| `web/src/views/SearchView.tsx` | Modify | 6, 7 |
| `web/src/views/NewPostView.tsx` | Modify | 9 |
