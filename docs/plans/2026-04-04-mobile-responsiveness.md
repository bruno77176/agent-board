---
project: BOARD
type: implementation-plan
---

# Mobile Responsiveness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the agent-board client usable on mobile without changing any desktop layout or behavior.

**Architecture:** Mobile-only additions using Tailwind responsive prefixes (`md:` hides/shows, overrides). Every desktop class stays untouched — mobile classes wrap, stack, or overlay on top. No JavaScript logic changes.

**Tech Stack:** React 19, Tailwind CSS v3 (default breakpoints: `md` = 768px), shadcn/ui, lucide-react

**Golden rule:** Every change must be verified at 375px viewport AND at 1280px viewport — desktop must look identical to before.

---

### Task 1: Mobile header + collapsible sidebar

**Files:**
- Modify: `client/src/App.tsx`

The sidebar is always visible on desktop (`md:block`). On mobile it is hidden by default and slides in as a fixed overlay when the hamburger button is tapped.

**Step 1: Add missing imports to App.tsx**

Current top of file:
```tsx
import { useState } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
```

Replace with:
```tsx
import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { cn } from './lib/utils'
```

**Step 2: Replace the AppLayout function**

Find the entire `function AppLayout` (lines 33–62) and replace with:

```tsx
function AppLayout({ onCreateClick }: { onCreateClick: () => void }) {
  useBoard()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar whenever the route changes (user tapped a nav link)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <PendingBanner />

      {/* Mobile top bar — only visible below md breakpoint */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-slate-200 bg-white flex-shrink-0 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-slate-600" />
        </button>
        <span className="font-semibold text-sm text-slate-900 tracking-tight">Agent Board</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile backdrop — darkens screen behind open sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar wrapper — fixed overlay on mobile, normal flex item on desktop */}
        <div className={cn(
          'fixed left-0 top-0 h-full z-40 md:relative md:z-auto',
          sidebarOpen ? 'block' : 'hidden md:block'
        )}>
          <Sidebar onCreateClick={() => { onCreateClick(); setSidebarOpen(false) }} />
        </div>

        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/:projectKey/board" element={<ProjectRoutes view="board" />} />
            <Route path="/:projectKey/backlog" element={<ProjectRoutes view="backlog" />} />
            <Route path="/:projectKey/epics" element={<ProjectRoutes view="epics" />} />
            <Route path="/:projectKey/epics/:epicId" element={<ProjectRoutes view="epicDetail" />} />
            <Route path="/:projectKey/roadmap" element={<ProjectRoutes view="roadmap" />} />
            <Route path="/:projectKey/settings" element={<ProjectRoutes view="settings" />} />
            <Route path="/:projectKey/features/:featureId" element={<ProjectRoutes view="featureDetail" />} />
            <Route path="/:projectKey/stories/:storyId" element={<ProjectRoutes view="story" />} />
            <Route path="/team" element={<TeamView />} />
            <Route path="/team/:agentSlug" element={<AgentProfileView />} />
            <Route path="/docs" element={<DocsView />} />
            <Route path="/:projectKey/docs" element={<ProjectDocsRoute />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/" element={<Navigate to="/team" replace />} />
            <Route path="*" element={<WelcomeScreen />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
```

**Step 3: Verify**

Open browser DevTools → set viewport to 375px width.
- Expected mobile: top bar with hamburger visible, sidebar hidden, main content full width
- Tap hamburger: sidebar slides in from left, backdrop darkens rest of screen
- Tap backdrop or nav link: sidebar closes
- Expected desktop (1280px): top bar hidden, sidebar always visible as left column — identical to before

**Step 4: Commit**

```bash
cd agent-board
git add client/src/App.tsx
git commit -m "feat(mobile): collapsible sidebar with hamburger menu on mobile"
```

---

### Task 2: FilterBar wrapping on mobile

**Files:**
- Modify: `client/src/components/FilterBar.tsx`

The filter bar currently overflows on small screens. Adding `flex-wrap` lets the items wrap to a second row on mobile without affecting desktop (desktop has enough width).

**Step 1: Change the root div classes**

Find line 39:
```tsx
<div className="flex items-center gap-2 flex-1">
```

Replace with:
```tsx
<div className="flex flex-wrap items-center gap-2 flex-1">
```

**Step 2: Make search input full-width on mobile**

Find line 46:
```tsx
className="h-7 px-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 w-36"
```

Replace with:
```tsx
className="h-7 px-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 w-full md:w-36"
```

**Step 3: Verify**

- Mobile (375px): search input is full width, assignee avatars + priority chips wrap to next line if they don't fit
- Desktop (1280px): unchanged — single row, search is 144px wide

**Step 4: Commit**

```bash
git add client/src/components/FilterBar.tsx
git commit -m "feat(mobile): FilterBar wraps to multiple rows on small screens"
```

---

### Task 3: BoardView toolbar wrapping on mobile

**Files:**
- Modify: `client/src/views/BoardView.tsx`

The toolbar has view toggles, group toggles, and FilterBar all in one row. On mobile it needs to wrap and have tighter padding.

**Step 1: Change the toolbar div classes**

Find line 139 (the toolbar const):
```tsx
<div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
```

Replace with:
```tsx
<div className="flex flex-wrap items-center gap-3 px-3 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
```

**Step 2: Verify**

- Mobile (375px): view toggle (board/list) on first row, group buttons wrap as needed, FilterBar on its own row
- Desktop (1280px): unchanged — single row with 24px padding

**Step 3: Commit**

```bash
git add client/src/views/BoardView.tsx
git commit -m "feat(mobile): BoardView toolbar wraps on small screens"
```

---

### Task 4: StoryDetailView responsive grid

**Files:**
- Modify: `client/src/views/StoryDetailView.tsx`

The 3-column grid breaks on mobile. On mobile, stack to single column (metadata panel moves below content). On `md+`, restore 3 columns.

**Step 1: Change the grid classes**

Find line 227:
```tsx
<div className="grid grid-cols-3 gap-8">
```

Replace with:
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
```

**Step 2: Reduce outer padding on mobile**

Find line 195:
```tsx
<div className="max-w-5xl mx-auto p-6">
```

Replace with:
```tsx
<div className="max-w-5xl mx-auto p-4 md:p-6">
```

**Step 3: Verify**

- Mobile (375px): title + description + criteria + activity stacked, then metadata panel below
- Desktop (1280px): unchanged — title/content in left 2/3, metadata in right 1/3

**Step 4: Commit**

```bash
git add client/src/views/StoryDetailView.tsx
git commit -m "feat(mobile): StoryDetailView stacks to single column on mobile"
```

---

### Task 5: StoryPanel full-screen overlay on mobile

**Files:**
- Modify: `client/src/components/StoryPanel.tsx`

On desktop, StoryPanel is a fixed-width right panel (`w-[440px]`). On mobile, it should be a full-screen overlay so the content is readable.

**Step 1: Change the root div classes**

Find line 66:
```tsx
<div className="w-[440px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-hidden shadow-lg">
```

Replace with:
```tsx
<div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto md:w-[440px] md:flex-shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-hidden shadow-lg">
```

**Step 2: Verify**

- Mobile (375px in BacklogView): tapping a backlog item opens StoryPanel as a full-screen overlay; close button (×) returns to list
- Desktop (1280px): unchanged — StoryPanel appears as a right-side panel beside the backlog list

**Step 3: Commit**

```bash
git add client/src/components/StoryPanel.tsx
git commit -m "feat(mobile): StoryPanel renders as full-screen overlay on mobile"
```

---

### Task 6: DocsView stacked layout on mobile

**Files:**
- Modify: `client/src/views/DocsView.tsx`

On desktop: file sidebar (w-56) on left, content on right. On mobile: file list on top (compact, scrollable), content below.

**Step 1: Change the outer container**

Find line 65:
```tsx
<div className="h-full flex">
```

Replace with:
```tsx
<div className="h-full flex flex-col md:flex-row">
```

**Step 2: Change the file list column**

Find line 67:
```tsx
<div className="w-56 flex-shrink-0 border-r border-slate-200 overflow-y-auto py-4">
```

Replace with:
```tsx
<div className="w-full md:w-56 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto py-4 max-h-44 md:max-h-none">
```

**Step 3: Tighten content padding on mobile**

Find line 96:
```tsx
<div className="flex-1 overflow-y-auto px-8 py-6">
```

Replace with:
```tsx
<div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
```

**Step 4: Verify**

- Mobile (375px): file list shown at top (scrollable, capped at 176px height), selected doc content shown below
- Desktop (1280px): unchanged — file list as left sidebar, content fills remaining space

**Step 5: Commit**

```bash
git add client/src/views/DocsView.tsx
git commit -m "feat(mobile): DocsView stacks file list above content on mobile"
```

---

### Task 7: AdminUsersPage horizontally scrollable on mobile

**Files:**
- Modify: `client/src/pages/AdminUsersPage.tsx`

The users table has 6 columns — on mobile it overflows. Wrapping the table in an `overflow-x-auto` div makes it horizontally scrollable without changing the desktop experience at all.

**Step 1: Wrap the table in an overflow container**

Find line 29:
```tsx
<div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <table className="w-full text-sm">
```

Replace with:
```tsx
<div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <div className="overflow-x-auto">
  <table className="w-full text-sm">
```

Find the closing `</table>` tag (before the closing `</div>` of the outer container) and add a closing `</div>` after it:
```tsx
  </table>
  </div>
</div>
```

**Step 2: Reduce outer padding on mobile**

Find line 27:
```tsx
<div className="p-8 max-w-4xl mx-auto">
```

Replace with:
```tsx
<div className="p-4 md:p-8 max-w-4xl mx-auto">
```

**Step 3: Verify**

- Mobile (375px): table scrolls horizontally, all columns accessible by swiping
- Desktop (1280px): unchanged — table fits without scroll

**Step 4: Commit**

```bash
git add client/src/pages/AdminUsersPage.tsx
git commit -m "feat(mobile): AdminUsersPage table scrolls horizontally on mobile"
```

---

### Task 8: Build and smoke-test

**Step 1: Build client**

```bash
cd agent-board
npm run build:local
```

Expected: exits with 0 errors. TypeScript compile must pass.

**Step 2: Full mobile smoke test**

Open browser DevTools → Responsive mode → iPhone SE (375×667).

Navigate to each view and verify:
| View | Mobile check |
|---|---|
| Board (Kanban) | Hamburger visible, tapping opens sidebar. Toolbar wraps. Columns scroll horizontally. |
| Board (List) | Toolbar wraps. Table rows visible. |
| Backlog | FilterBar wraps. Tapping a story shows full-screen StoryPanel. Close × works. |
| Story detail | Single column layout. Metadata section below content. |
| Epics | Grid already responsive — verify cards stack. |
| Roadmap | Timeline scrolls horizontally. |
| Docs | File list on top (compact), content below. |
| Team | Already responsive — verify. |
| Admin Users | Table scrolls horizontally. |

**Step 3: Desktop regression check**

Set viewport back to 1280px. Verify every view looks exactly as before. No layout shifts, no missing elements.

**Step 4: Commit dist and push**

```bash
npm run build:local
git add client/dist
git commit -m "build: update client dist with mobile responsiveness"
git push
```
