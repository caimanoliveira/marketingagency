# Lume Visual Identity Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current warm-light identity with Dark Shell + Light Cards — dark navy chrome (sidebar, topbar, page bg) with white card surfaces, orange accent, Plus Jakarta Sans.

**Architecture:** Primarily CSS token changes + shell component color overrides in `styles.css`. One font URL swap in `index.html`. One TypeScript component fix (`Logo.tsx` brand text color). Skeleton shimmer updated for dark bg. No structural changes — all component APIs stay the same.

**Tech Stack:** Vite, React 19, CSS custom properties (no Tailwind), Plus Jakarta Sans via Google Fonts

**Working directory:** `/Users/caimanoliveira/Marketing agency`

---

## File Structure

**Modified:**
- `src/web/index.html` — swap Google Fonts URL (Inter → Plus Jakarta Sans)
- `src/web/styles.css` — new token values + shell component colors + dark skeleton
- `src/web/components/Logo.tsx` — fix brand name color on dark bg
- `src/web/pages/PostsList.tsx` — spot-check
- `src/web/pages/Analytics.tsx` — spot-check
- `src/web/pages/Calendar.tsx` — spot-check
- `src/web/pages/Benchmarks.tsx` — spot-check
- `src/web/pages/Strategy.tsx` — spot-check
- `src/web/pages/Editor.tsx` — spot-check
- `src/web/pages/Settings.tsx` — spot-check
- `src/web/pages/Media.tsx` — spot-check

---

## Task 1: Font Swap

**Files:**
- Modify: `src/web/index.html`

- [ ] **Step 1: Replace the Google Fonts `<link>` in `index.html`**

Find:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

Replace with:
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Build to verify font loads**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xms`

- [ ] **Step 3: Commit**

```bash
git add src/web/index.html
git commit -m "feat(lume-s11): swap Inter for Plus Jakarta Sans"
```

---

## Task 2: Color Token System

**Files:**
- Modify: `src/web/styles.css` — `:root` block only

- [ ] **Step 1: Replace the entire `:root` block in `styles.css`**

Find the `:root { ... }` block (starts at line 1, ends before `/* Reset + Base */`) and replace it entirely with:

```css
:root {
  /* ── Primary accent — orange ── */
  --lume-primary:              #FF6B35;
  --lume-primary-hover:        #FF5520;
  --lume-primary-active:       #E84A0A;
  --lume-primary-soft:         #FFF0EB;
  --lume-primary-soft-hover:   #FFE4D6;
  --lume-primary-text-on:      #FFFFFF;

  /* ── Indigo accent (secondary) ── */
  --lume-indigo:               #1E40AF;
  --lume-indigo-soft:          #EEF2FF;

  /* ── Page & shell backgrounds ── */
  --lume-bg:                   #0D1426;
  --lume-sidebar-bg:           #080F1E;
  --lume-sidebar-border:       #1A2840;

  /* ── Card surfaces (stay light) ── */
  --lume-surface:              #FFFFFF;
  --lume-surface-soft:         #F0F4FF;
  --lume-surface-hover:        #E8EEFF;

  /* ── Borders ── */
  --lume-border:               #E8EDF5;
  --lume-border-strong:        #D1D9EC;
  --lume-border-dark:          #1E2D4A;
  --lume-border-focus:         #FF6B35;

  /* ── Text on light surfaces ── */
  --lume-text:                 #111827;
  --lume-text-muted:           #6B7280;
  --lume-text-soft:            #9CA3AF;
  --lume-text-inverse:         #FFFFFF;

  /* ── Text on dark shell/nav ── */
  --lume-text-nav:             #64748B;
  --lume-text-nav-active:      #FFFFFF;
  --lume-text-nav-section:     #374151;

  /* ── Semantic ── */
  --lume-success:              #15803D;
  --lume-success-bg:           #E7F5EC;
  --lume-warning:              #C2410C;
  --lume-warning-bg:           #FEF3EA;
  --lume-danger:               #B91C1C;
  --lume-danger-bg:            #FEEBEB;
  --lume-info:                 #0369A1;
  --lume-info-bg:              #E6F3FA;

  /* ── Radius ── */
  --lume-radius-sm:   6px;
  --lume-radius-md:   10px;
  --lume-radius-lg:   16px;
  --lume-radius-xl:   24px;
  --lume-radius-full: 9999px;

  /* ── Spacing (4px base) ── */
  --lume-space-1:  4px;
  --lume-space-2:  8px;
  --lume-space-3:  12px;
  --lume-space-4:  16px;
  --lume-space-5:  24px;
  --lume-space-6:  32px;
  --lume-space-8:  48px;
  --lume-space-10: 64px;

  /* ── Shadows ── */
  --lume-shadow-sm:    0 1px 2px rgba(0,0,0,0.12);
  --lume-shadow-md:    0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12);
  --lume-shadow-lg:    0 16px 40px rgba(0,0,0,0.24), 0 4px 12px rgba(0,0,0,0.12);
  --lume-shadow-focus: 0 0 0 3px rgba(255,107,53,0.35);

  /* ── Typography ── */
  --lume-font-sans: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --lume-text-xs:   12px;
  --lume-text-sm:   13px;
  --lume-text-base: 15px;
  --lume-text-lg:   18px;
  --lume-text-xl:   22px;
  --lume-text-2xl:  28px;
  --lume-text-3xl:  36px;

  --lume-transition: 150ms ease;
}
```

- [ ] **Step 2: Build to verify no CSS errors**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xms`

- [ ] **Step 3: Commit**

```bash
git add src/web/styles.css
git commit -m "feat(lume-s11): new dark-shell color token system"
```

---

## Task 3: Shell Component CSS

**Files:**
- Modify: `src/web/styles.css` — layout/shell sections

- [ ] **Step 1: Update `.lume-sidebar` and its mobile variant**

Find the `.lume-sidebar` block and replace it with:

```css
.lume-sidebar {
  background: var(--lume-sidebar-bg);
  border-right: 1px solid var(--lume-sidebar-border);
  padding: var(--lume-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-4);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
@media (max-width: 1023px) {
  .lume-sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 280px;
    transform: translateX(-100%);
    transition: transform 200ms ease;
    z-index: 60;
    box-shadow: var(--lume-shadow-lg);
  }
  .lume-sidebar.lume-sidebar-open { transform: translateX(0); }
}
```

- [ ] **Step 2: Update brand, nav section labels, nav links**

Find and replace each of these blocks:

`.lume-brand-name`:
```css
.lume-brand-name {
  font-size: var(--lume-text-xl);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--lume-text-inverse);
}
```

`.lume-nav-section`:
```css
.lume-nav-section {
  font-size: var(--lume-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--lume-text-nav-section);
  padding: var(--lume-space-3) var(--lume-space-2) var(--lume-space-1);
  font-weight: 600;
}
```

`.lume-nav a`:
```css
.lume-nav a {
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
  padding: var(--lume-space-2) var(--lume-space-3);
  border-radius: var(--lume-radius-md);
  color: var(--lume-text-nav);
  font-size: var(--lume-text-sm);
  font-weight: 500;
  text-decoration: none;
  transition: background var(--lume-transition), color var(--lume-transition);
}
.lume-nav a:hover {
  background: rgba(255, 107, 53, 0.08);
  color: #CBD5E1;
  text-decoration: none;
}
.lume-nav a.active {
  background: rgba(255, 107, 53, 0.14);
  color: var(--lume-text-nav-active);
  font-weight: 600;
}
.lume-nav a .lume-nav-icon { font-size: 16px; flex-shrink: 0; }
```

`.lume-sidebar-foot`:
```css
.lume-sidebar-foot {
  margin-top: auto;
  padding-top: var(--lume-space-4);
  border-top: 1px solid var(--lume-sidebar-border);
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-2);
}
```

`.lume-user-email`:
```css
.lume-user-email {
  font-size: var(--lume-text-xs);
  color: var(--lume-text-nav);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Update topbar and hamburger**

`.lume-topbar`:
```css
.lume-topbar {
  display: none;
  background: var(--lume-sidebar-bg);
  border-bottom: 1px solid var(--lume-sidebar-border);
  padding: var(--lume-space-3) var(--lume-space-4);
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 40;
}
@media (max-width: 1023px) {
  .lume-topbar { display: flex; }
}
```

`.lume-hamburger`:
```css
.lume-hamburger {
  background: transparent;
  border: 1px solid var(--lume-sidebar-border);
  border-radius: var(--lume-radius-md);
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: var(--lume-text-inverse);
  font-size: 18px;
}
.lume-hamburger:hover { background: rgba(255, 255, 255, 0.06); }
```

- [ ] **Step 4: Build to verify**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xms`

- [ ] **Step 5: Commit**

```bash
git add src/web/styles.css
git commit -m "feat(lume-s11): dark shell CSS — sidebar, topbar, nav colors"
```

---

## Task 4: Logo Brand Name Fix

**Files:**
- Modify: `src/web/components/Logo.tsx`

Context: `.lume-brand-name` now uses `--lume-text-inverse` (white) from the updated CSS — no TypeScript change needed. However, the SVG gradient still references the old warm orange colors (`#FFB366`, `#E85D1F`, `#B8420C`). Update it to the new `#FF6B35` palette.

- [ ] **Step 1: Update SVG gradient colors in `Logo.tsx`**

Find and replace the `<defs>` and flame path section:

```tsx
<defs>
  <radialGradient id="lume-flame-grad" cx="0.5" cy="0.7" r="0.7">
    <stop offset="0%"   stopColor="#FFAA6B" />
    <stop offset="55%"  stopColor="#FF6B35" />
    <stop offset="100%" stopColor="#E84A0A" />
  </radialGradient>
</defs>
```

- [ ] **Step 2: Build + verify no TypeScript errors**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xms`

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Logo.tsx
git commit -m "feat(lume-s11): update flame gradient to new orange palette"
```

---

## Task 5: Skeleton — Dark Background Variant

**Files:**
- Modify: `src/web/styles.css`
- Modify: `src/web/components/Skeleton.tsx`

Context: All `SkeletonRow` usages are rendered directly on the dark page bg (`#0D1426`). The current `.skeleton` shimmer uses light surface tokens which would appear as bright white flashes on dark bg. Update the default shimmer to dark tones.

- [ ] **Step 1: Update `.skeleton` shimmer in `styles.css` for dark bg**

Find the `@keyframes lume-shimmer` and `.skeleton` block. Replace `.skeleton` with:

```css
.skeleton {
  background: linear-gradient(
    90deg,
    #151E35 0px,
    #1E2D4A 200px,
    #151E35 400px
  );
  background-size: 800px;
  border-radius: var(--lume-radius-md);
  animation: lume-shimmer 1.4s infinite linear;
}
```

Also add a light variant for use inside white cards (future-proofing):

```css
.skeleton-light {
  background: linear-gradient(
    90deg,
    var(--lume-surface-soft) 0px,
    var(--lume-border) 200px,
    var(--lume-surface-soft) 400px
  );
  background-size: 800px;
  border-radius: var(--lume-radius-md);
  animation: lume-shimmer 1.4s infinite linear;
}
```

- [ ] **Step 2: Build to verify**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xms`

- [ ] **Step 3: Commit**

```bash
git add src/web/styles.css
git commit -m "feat(lume-s11): dark skeleton shimmer for page-level loading states"
```

---

## Task 6: Page Spot-Check — Hardcoded Light Colors

**Files:**
- Modify: any page with hardcoded light bg assumptions

- [ ] **Step 1: Search all pages for hardcoded light backgrounds**

```bash
grep -rn "background.*#[Ff][Ff][Ff]\|background.*white\|background: \"#f" \
  "/Users/caimanoliveira/Marketing agency/src/web/pages/" \
  "/Users/caimanoliveira/Marketing agency/src/web/components/" \
  2>/dev/null | grep -v "lume-\|//\|network-preview\|card-after\|card-before"
```

Review each result. Any element that renders **directly on the page background** (not inside a `.lume-card`) with a hardcoded white background needs to be updated. Elements inside cards should keep white backgrounds.

- [ ] **Step 2: Fix `network-preview .preview-media` hardcoded color**

In `styles.css`, find:
```css
.network-preview .preview-media { ... background: #F0EBE5; ... }
```

Replace the background with:
```css
background: var(--lume-surface-soft);
```

- [ ] **Step 3: Fix any page-level inline `background: "#fff"` assumptions**

For any hits from Step 1 that are page-level wrappers (not card contents), change to use `var(--lume-surface)` or remove if inheriting from parent is fine.

- [ ] **Step 4: Build to verify**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xms`

- [ ] **Step 5: Commit**

```bash
git add src/web/styles.css src/web/pages src/web/components
git commit -m "fix(lume-s11): remove hardcoded light bg assumptions from page-level elements"
```

---

## Task 7: Visual Verify + Deploy

**Files:** none — verification only

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run dev 2>&1 &
sleep 4 && curl -s http://localhost:5173 | head -3
```

Expected: HTML response with `<html lang="pt-BR">`

- [ ] **Step 2: Visual checklist** — open http://localhost:5173 and verify each item:

```
Sidebar
  [ ] Dark navy background (#080F1E)
  [ ] Lume brand name: white, Plus Jakarta Sans, font-weight 800
  [ ] Flame icon: orange gradient visible on dark
  [ ] Nav items: muted blue-gray default, white + orange bg on active
  [ ] Nav section labels: dark gray (#374151), uppercase
  [ ] Bottom border above user badge: dark, not light

Topbar (mobile — resize browser to <1024px)
  [ ] Dark navy matches sidebar
  [ ] Hamburger: light icon, dark border

Content / Cards
  [ ] Page background: dark navy (#0D1426)
  [ ] Cards: white, clearly visible on dark bg
  [ ] Typography: Plus Jakarta Sans loaded (check DevTools Network tab)

Login page
  [ ] Dark navy background behind white auth card
  [ ] Auth card: white, readable

Specific pages
  [ ] PostsList: table inside white card, skeleton rows are dark shimmer
  [ ] Analytics: charts render, tooltips readable (white bg)
  [ ] Calendar: white cells visible on dark page bg, scroll wrapper ok
  [ ] Kanban: columns visible (surface-soft = light blue tint on white)
  [ ] Settings: connection cards white on dark bg
  [ ] Media: media-grid tiles white on dark bg

No broken states
  [ ] No black text on dark bg anywhere
  [ ] No invisible elements (white on white or dark on dark)
  [ ] Toasts appear with readable contrast
```

- [ ] **Step 3: Kill dev server and run production build**

```bash
kill %1 2>/dev/null; cd "/Users/caimanoliveira/Marketing agency" && npm run build 2>&1 | tail -5
```

Expected: `✓ built in Xms` with no errors.

- [ ] **Step 4: Deploy**

```bash
cd "/Users/caimanoliveira/Marketing agency" && npm run deploy 2>&1 | tail -6
```

Expected: `Current Version ID: ...`

- [ ] **Step 5: Push + tag**

```bash
cd "/Users/caimanoliveira/Marketing agency" && git push origin main && git tag week-11-lume && git push origin week-11-lume
```

Expected: pushed to GitHub, tag created.
