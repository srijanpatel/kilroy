# Layout Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the web UI on a single 720px content column with the omnibar matching that width, and move Invite/Theme Toggle out of the omnibar into the navbar actions area.

**Architecture:** Pure CSS + React component restructuring. No new dependencies. The omnibar becomes navigation-only; app-level actions (invite, theme, account) group together at the right edge of the navbar.

**Tech Stack:** React 19, CSS (no preprocessors), Vite

**Note:** This is a CSS/layout refactor. There are no unit tests for layout — each task includes manual verification steps instead.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `web/src/index.css` | Modify | Unify content width, widen omnibar, add navbar-actions styles, adjust account-menu positioning |
| `web/src/components/Omnibar.tsx` | Modify | Remove invite popover and theme toggle JSX + state |
| `web/src/components/ThemeToggle.tsx` | Create | Self-contained theme toggle component (extracted from Omnibar) |
| `web/src/components/InvitePopover.tsx` | Create | Self-contained invite button + popover (extracted from Omnibar) |
| `web/src/views/ProjectShell.tsx` | Modify | Add navbar-actions container with InvitePopover, ThemeToggle, AccountMenu |
| `web/src/views/BrowseView.tsx` | Modify | Remove `reading` class distinction (no-op here, already uses `content`) |
| `web/src/views/PostView.tsx` | Modify | Change `content reading` → `content` |
| `web/src/views/NewPostView.tsx` | Modify | Change `content reading` → `content` |
| `web/src/views/ProjectSettingsView.tsx` | Modify | Change `content reading` → `content` |
| `web/src/views/SearchView.tsx` | Modify | No change needed (already uses `content`) |

---

### Task 1: Unify content width in CSS

**Files:**
- Modify: `web/src/index.css:23-58`

- [ ] **Step 1: Change `--content-width` to 720px and remove `.content.reading`**

In `web/src/index.css`, change line 23:

```css
/* Before */
--content-width: 960px;
--reading-width: 720px;

/* After */
--content-width: 720px;
```

Remove the `--reading-width` variable (line 24) entirely.

Remove the `.content.reading` rule (lines 56-58):

```css
/* Remove this entire rule */
.content.reading {
  max-width: var(--reading-width);
}
```

- [ ] **Step 2: Ensure prose tables scroll horizontally**

Search `index.css` for `.prose table` styles. If there is no `overflow-x: auto` on a table wrapper, add it. Find the `.prose table` rule and wrap tables in an overflow container by adding this CSS near the other `.prose` rules:

```css
.prose table {
  display: block;
  overflow-x: auto;
}
```

If `.prose table` already has styles, add `display: block; overflow-x: auto;` to the existing rule.

- [ ] **Step 3: Verify**

Run: `cd /home/ubuntu/kilroy && bun run --cwd web build`
Expected: Build succeeds with no errors.

Open the app in a browser. Browse view cards should now be narrower (720px instead of 960px). Post detail view should look identical (already was 720px).

- [ ] **Step 4: Commit**

```bash
git add web/src/index.css
git commit -m "style: unify content width to 720px, remove reading-width distinction"
```

---

### Task 2: Remove `reading` class from all views

**Files:**
- Modify: `web/src/views/PostView.tsx:133-137`
- Modify: `web/src/views/NewPostView.tsx:98-101`
- Modify: `web/src/views/ProjectSettingsView.tsx:32,39`

- [ ] **Step 1: Update PostView.tsx**

Change all instances of `className="content reading"` to `className="content"`:

```tsx
// Line 133 — change:
if (error) return <div className="content reading"><div className="error">{error}</div></div>;
// to:
if (error) return <div className="content"><div className="error">{error}</div></div>;

// Line 134 — change:
if (!post) return <div className="content reading"><SkeletonCards count={1} /></div>;
// to:
if (!post) return <div className="content"><SkeletonCards count={1} /></div>;

// Line 137 — change:
<div className="content reading">
// to:
<div className="content">
```

- [ ] **Step 2: Update NewPostView.tsx**

Change all instances of `className="content reading"` to `className="content"`:

```tsx
// Line 98 — change:
if (loading) return <div className="content reading"><SkeletonCards count={1} /></div>;
// to:
if (loading) return <div className="content"><SkeletonCards count={1} /></div>;

// Line 101 — change:
<div className="content reading">
// to:
<div className="content">
```

- [ ] **Step 3: Update ProjectSettingsView.tsx**

Change all instances of `className="content reading"` to `className="content"`:

```tsx
// Line 32 — change:
<div className="content reading">
// to:
<div className="content">

// Line 39 — change:
<div className="content reading">
// to:
<div className="content">
```

- [ ] **Step 4: Verify**

Run: `cd /home/ubuntu/kilroy && bun run --cwd web build`
Expected: Build succeeds. No references to `reading` class remain in view files.

Verify with grep:
```bash
grep -r 'content reading' web/src/
```
Expected: No matches.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/PostView.tsx web/src/views/NewPostView.tsx web/src/views/ProjectSettingsView.tsx
git commit -m "refactor: remove reading class, all views use unified content width"
```

---

### Task 3: Extract ThemeToggle and InvitePopover from Omnibar

**Files:**
- Create: `web/src/components/ThemeToggle.tsx`
- Create: `web/src/components/InvitePopover.tsx`
- Modify: `web/src/components/Omnibar.tsx`

- [ ] **Step 1: Create ThemeToggle component**

Create `web/src/components/ThemeToggle.tsx`:

```tsx
import { useState, useEffect } from 'react';

function getInitialTheme(): string {
  const stored = localStorage.getItem('kilroy_theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kilroy_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '\u2600' : '\u263E'}
    </button>
  );
}
```

- [ ] **Step 2: Create InvitePopover component**

Create `web/src/components/InvitePopover.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { getProjectInfo } from '../lib/api';
import { useProject } from '../context/ProjectContext';
import { InviteCard } from './InviteCard';

export function InvitePopover() {
  const { accountSlug, projectSlug } = useProject();
  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getProjectInfo(accountSlug, projectSlug)
      .then((info) => {
        setJoinLink(info?.join_link || null);
        setInstallCommand(info?.install_command || null);
      })
      .catch(() => {});
  }, [accountSlug, projectSlug]);

  useEffect(() => {
    if (!inviteOpen) return;
    const handler = (e: MouseEvent) => {
      if (inviteRef.current && !inviteRef.current.contains(e.target as Node)) {
        setInviteOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inviteOpen]);

  if (!joinLink && !installCommand) return null;

  return (
    <div className="invite-wrapper" ref={inviteRef}>
      <button
        className="invite-btn"
        onClick={() => setInviteOpen((o) => !o)}
        title="Invite others"
      >
        + Invite
      </button>
      {inviteOpen && (
        <div className="invite-popover">
          <InviteCard installCommand={installCommand} joinLink={joinLink} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Strip invite and theme from Omnibar.tsx**

In `web/src/components/Omnibar.tsx`:

**Remove these imports** (line 3, 6):
```tsx
// Remove:
import { browse, search, getProjectInfo } from '../lib/api';
// Replace with:
import { browse, search } from '../lib/api';

// Remove:
import { InviteCard } from './InviteCard';
```

**Remove `getInitialTheme` function** (lines 12-16): delete entirely.

**Remove these state variables and effects from the `Omnibar` component** (keeping only search-related state):

Remove from state declarations:
```tsx
// Remove these lines:
const [theme, setTheme] = useState(getInitialTheme);
const [joinLink, setJoinLink] = useState<string | null>(null);
const [installCommand, setInstallCommand] = useState<string | null>(null);
const [inviteOpen, setInviteOpen] = useState(false);
const inviteRef = useRef<HTMLDivElement>(null);
```

Remove the theme effect (lines 25-28):
```tsx
// Remove:
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('kilroy_theme', theme);
}, [theme]);
```

Remove `toggleTheme` (line 30):
```tsx
// Remove:
const toggleTheme = () => setTheme((t) => t === 'dark' ? 'light' : 'dark');
```

Remove the `getProjectInfo` effect (lines 44-51):
```tsx
// Remove:
useEffect(() => {
  getProjectInfo(accountSlug, projectSlug)
    .then((info) => {
      setJoinLink(info?.join_link || null);
      setInstallCommand(info?.install_command || null);
    })
    .catch(() => {});
}, [accountSlug, projectSlug]);
```

Remove the invite click-outside effect (lines 53-62):
```tsx
// Remove:
useEffect(() => {
  if (!inviteOpen) return;
  const handler = (e: MouseEvent) => {
    if (inviteRef.current && !inviteRef.current.contains(e.target as Node)) {
      setInviteOpen(false);
    }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [inviteOpen]);
```

**Remove invite and theme JSX from the resting state** (lines 256-278). The `omnibar-resting` div should end after the `omnibar-hint` span:

```tsx
{/* Remove everything after the omnibar-hint closing </span>, before the closing </div> of omnibar-resting: */}

{/* Remove this block (lines 256-278): */}
{(joinLink || installCommand) && (
  <div className="invite-wrapper" ref={inviteRef}>
    <button
      className="invite-btn"
      onClick={(e) => { e.stopPropagation(); setInviteOpen((o) => !o); }}
      title="Invite others"
    >
      + Invite
    </button>
    {inviteOpen && (
      <div className="invite-popover">
        <InviteCard installCommand={installCommand} joinLink={joinLink} />
      </div>
    )}
  </div>
)}
<button
  className="theme-toggle"
  onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
  {theme === 'dark' ? '\u2600' : '\u263E'}
</button>
```

After removal, the `omnibar-resting` div's content should be:
```tsx
<div className="omnibar-resting" onClick={activate}>
  <Link to="/" className="omnibar-home" onClick={(e) => e.stopPropagation()} title="Kilroy — switch projects">
    <KilroyMark size={22} />
  </Link>
  <Link to={pp('/browse/')} className="omnibar-wordmark" onClick={(e) => e.stopPropagation()}>
    {accountSlug}<span className="omnibar-sep">/</span>{projectSlug}<span className="omnibar-sep">/</span>
  </Link>
  {segments.length > 0 && (
    <span className="omnibar-path">
      {segments.map((seg, i) => {
        const path = segments.slice(0, i + 1).join('/');
        return (
          <span key={path}>
            {i > 0 && <span className="omnibar-sep">/</span>}
            <Link
              to={pp(`/browse/${path}/`)}
              className="omnibar-segment"
              onClick={(e) => e.stopPropagation()}
            >
              {seg}
            </Link>
          </span>
        );
      })}
    </span>
  )}
  <span className="omnibar-hint">
    <kbd>⌘K</kbd>
  </span>
</div>
```

- [ ] **Step 4: Verify**

Run: `cd /home/ubuntu/kilroy && bun run --cwd web build`
Expected: Build succeeds with no errors. No unused import warnings.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ThemeToggle.tsx web/src/components/InvitePopover.tsx web/src/components/Omnibar.tsx
git commit -m "refactor: extract ThemeToggle and InvitePopover from Omnibar"
```

---

### Task 4: Add navbar-actions container and widen omnibar

**Files:**
- Modify: `web/src/views/ProjectShell.tsx:1-104`
- Modify: `web/src/index.css:60-80, 105-115, 1267-1271`

- [ ] **Step 1: Update ProjectShell.tsx to use navbar-actions**

Add imports for the new components at the top of the file:

```tsx
// Add these imports:
import { ThemeToggle } from '../components/ThemeToggle';
import { InvitePopover } from '../components/InvitePopover';
```

Replace the `omnibar-row` section in the `ProjectLayout` JSX (lines 88-104). Change:

```tsx
<div className="omnibar-row">
  <button
    className={`sidebar-toggle-btn${expanded ? ' sidebar-open' : ''}`}
    onClick={toggle}
    title={expanded ? 'Collapse sidebar (⌘\\)' : 'Expand sidebar (⌘\\)'}
    aria-label="Toggle sidebar"
  >
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="2" width="16" height="14" rx="2" />
      <line x1="6.5" y1="2" x2="6.5" y2="16" />
      <line x1="3" y1="7" x2="5" y2="7" />
      <line x1="3" y1="10" x2="5" y2="10" />
    </svg>
  </button>
  <Omnibar currentTopic={currentTopic} />
  <AccountMenu />
</div>
```

To:

```tsx
<div className="omnibar-row">
  <button
    className={`sidebar-toggle-btn${expanded ? ' sidebar-open' : ''}`}
    onClick={toggle}
    title={expanded ? 'Collapse sidebar (⌘\\)' : 'Expand sidebar (⌘\\)'}
    aria-label="Toggle sidebar"
  >
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="2" width="16" height="14" rx="2" />
      <line x1="6.5" y1="2" x2="6.5" y2="16" />
      <line x1="3" y1="7" x2="5" y2="7" />
      <line x1="3" y1="10" x2="5" y2="10" />
    </svg>
  </button>
  <Omnibar currentTopic={currentTopic} />
  <div className="navbar-actions">
    <InvitePopover />
    <ThemeToggle />
    <AccountMenu />
  </div>
</div>
```

- [ ] **Step 2: Add navbar-actions CSS and adjust account-menu positioning**

In `web/src/index.css`, add the `.navbar-actions` rule right after the `.sidebar-toggle-btn` styles (after line 103):

```css
.navbar-actions {
  position: absolute;
  right: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
```

Change `.account-menu-wrapper` (line 1268-1271) from:

```css
.account-menu-wrapper {
  position: absolute;
  right: 1.5rem;
}
```

To:

```css
.account-menu-wrapper {
  position: relative;
}
```

Also update `.invite-wrapper` (lines 1156-1159) from:

```css
.invite-wrapper {
  position: relative;
  margin-left: 0.25rem;
}
```

To:

```css
.invite-wrapper {
  position: relative;
}
```

Remove `margin-left: 0.25rem` since the gap on `.navbar-actions` handles spacing.

Also remove `margin-left: 0.5rem` from `.theme-toggle` (line 1254):

```css
/* Before */
.theme-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  margin-left: 0.5rem;
  ...
}

/* After */
.theme-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  ...
}
```

- [ ] **Step 3: Widen omnibar to 720px**

In `web/src/index.css`, change `.omnibar` max-width (line 109):

```css
/* Before */
.omnibar {
  ...
  max-width: 640px;
  ...
}

/* After */
.omnibar {
  ...
  max-width: var(--content-width);
  ...
}
```

Using `var(--content-width)` instead of hardcoding 720px keeps a single source of truth.

- [ ] **Step 4: Verify**

Run: `cd /home/ubuntu/kilroy && bun run --cwd web build`
Expected: Build succeeds.

Open the app in a browser. Verify:
- Omnibar pill is wider, visually aligned with the content below
- Invite button, theme toggle, and account avatar are grouped together at the right edge of the navbar, outside the omnibar pill
- Clicking Invite still opens the popover correctly
- Theme toggle still works
- Account menu still opens correctly
- Sidebar toggle still works at the left edge
- Browse view and post detail view are the same width

- [ ] **Step 5: Commit**

```bash
git add web/src/views/ProjectShell.tsx web/src/index.css
git commit -m "feat: navbar-actions container, widen omnibar to match content width"
```
