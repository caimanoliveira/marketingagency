# Lume — Visual Identity Redesign (Semana 11)

**Date:** 2026-04-27
**Status:** Approved for implementation

---

## Goal

Replace Lume's current "warm Airbnb-like" light identity with a **Dark Shell + Light Cards** system — dark navy chrome (sidebar, topbar, page background) with white card surfaces. Swap Inter for Plus Jakarta Sans. Result: higher personality, more energy, better visual contrast between navigation and content.

## Design Decisions

| Dimension | Choice | Rationale |
|---|---|---|
| Personality | Vivo & Energético | Current feels generic; needs character |
| Color direction | Índigo & Laranja | Dark navy base, orange accent — professional + vibrant |
| Typography | Plus Jakarta Sans | Single versatile family, bold at 800, clean at 400 |
| Architecture | Dark shell + light cards | Max personality impact without hurting data readability |

---

## Token Changes

### New values for `styles.css` `:root`

```css
/* Page & shell */
--lume-bg:               #0D1426;   /* page background — dark navy */
--lume-sidebar-bg:       #080F1E;   /* sidebar — deeper navy */
--lume-sidebar-border:   #1A2840;   /* sidebar right border */

/* Surfaces (cards stay light) */
--lume-surface:          #FFFFFF;
--lume-surface-soft:     #F0F4FF;   /* light blue tint instead of warm cream */
--lume-surface-hover:    #E8EEFF;

/* Borders */
--lume-border:           #E8EDF5;   /* card borders — light */
--lume-border-strong:    #D1D9EC;
--lume-border-dark:      #1E2D4A;   /* nav/shell borders */
--lume-border-focus:     #FF6B35;

/* Primary accent — orange, slightly more vivid */
--lume-primary:          #FF6B35;
--lume-primary-hover:    #FF5520;
--lume-primary-active:   #E84A0A;
--lume-primary-soft:     #FFF0EB;
--lume-primary-soft-hover: #FFE4D6;
--lume-primary-text-on:  #FFFFFF;

/* Indigo accent (secondary) */
--lume-indigo:           #1E40AF;
--lume-indigo-soft:      #EEF2FF;

/* Text — two contexts */
--lume-text:             #111827;   /* on light surfaces */
--lume-text-muted:       #6B7280;
--lume-text-soft:        #9CA3AF;
--lume-text-inverse:     #FFFFFF;   /* on dark shell */
--lume-text-nav:         #64748B;   /* nav items default */
--lume-text-nav-active:  #FFFFFF;   /* active nav item */
--lume-text-nav-section: #374151;   /* nav section labels */

/* Typography */
--lume-font-sans: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
```

Tokens that do **not** change: spacing scale, radius scale, shadow scale, semantic colors (success, warning, danger, info), transition.

---

## Component Changes

### Shell (`styles.css`)

**`.lume-sidebar`**
- `background` → `var(--lume-sidebar-bg)` (#080F1E)
- `border-right` → `1px solid var(--lume-sidebar-border)`

**`.lume-brand-name`**
- `color` → `var(--lume-text-inverse)` (white)

**`.lume-nav-section`**
- `color` → `var(--lume-text-nav-section)`

**`.lume-nav a`**
- `color` → `var(--lume-text-nav)`

**`.lume-nav a:hover`**
- `background` → `rgba(255,107,53,0.08)`
- `color` → `#CBD5E1`

**`.lume-nav a.active`**
- `background` → `rgba(255,107,53,0.14)`
- `color` → `var(--lume-text-nav-active)` (white)

**`.lume-sidebar-foot`**
- `border-top` → `1px solid var(--lume-sidebar-border)`

**`.lume-user-email`**
- `color` → `var(--lume-text-nav)`

**`.lume-topbar`**
- `background` → `var(--lume-sidebar-bg)`
- `border-bottom` → `1px solid var(--lume-sidebar-border)`

**`.lume-hamburger`**
- `border-color` → `var(--lume-border-dark)`
- `color` → `var(--lume-text-inverse)`

**`.lume-hamburger:hover`**
- `background` → `rgba(255,255,255,0.06)`

### Login page (`lume-auth-wrap`, `lume-auth-card`)

Login is the one page with no sidebar. The auth card (white, centered) stays white — it will float naturally on the dark bg. No changes needed beyond the bg token update.

### Logo component (`Logo.tsx`)

The flame/wordmark SVG currently uses `--lume-primary` for the mark and `--lume-text` for the name. On dark bg, `--lume-text` (#111827) renders black-on-black. Fix: add a `dark` prop or use `currentColor` so the brand name inherits white from the parent context.

**Change:** In `Logo.tsx`, the brand text part should use `color: var(--lume-text-inverse)` when rendered inside the sidebar, or use `currentColor` and set `color: white` on `.lume-brand`.

### Skeleton

`.skeleton` shimmer uses `--lume-surface-soft` and `--lume-border`. On dark page bg (outside of cards) this will look too light. Add a dark-context variant:

```css
.lume-page-skeleton {
  background: linear-gradient(90deg, #151E35 0px, #1E2D4A 200px, #151E35 400px);
  background-size: 800px;
  animation: lume-shimmer 1.4s infinite linear;
  border-radius: var(--lume-radius-md);
}
```

Pages that render skeletons directly on the page bg (not inside a card) use `.lume-page-skeleton`.

---

## Typography

**`index.html`** — swap Google Fonts URL:

Remove:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

Add:
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet">
```

`--lume-font-sans` token update in styles.css handles the rest — all components inherit automatically.

---

## What Does NOT Change

- Card structure, padding, border-radius — cards stay white #FFFFFF
- All page layouts and grid systems
- Component API (Button, Card, Badge, Modal, etc.)
- Spacing scale, shadow scale
- Status badge colors
- Chart colors (already use tokens, will adapt)
- All TypeScript / business logic

---

## Scope

| File | Change |
|---|---|
| `src/web/styles.css` | Token values + shell component colors + lume-page-skeleton |
| `src/web/index.html` | Swap Google Fonts URL |
| `src/web/components/Logo.tsx` | Fix brand text color on dark bg |
| `src/web/pages/*.tsx` | Spot-check for hardcoded light bg assumptions (e.g. `background: #fff` inline) |
| `src/web/components/Layout.tsx` | Verify sidebar scrim color works on dark bg |

**Estimated scope:** 1 session. Primarily CSS token changes — not a structural redesign.

---

## Validation Checklist

- [ ] Sidebar dark navy, brand white, nav items legible
- [ ] Active nav item: orange-tinted bg + white text
- [ ] Topbar matches sidebar on mobile
- [ ] Cards white on dark page bg — contrast clear
- [ ] Plus Jakarta Sans loaded, all text updated
- [ ] Login page: white card floats on dark bg, readable
- [ ] Analytics charts readable (tokens adapt automatically)
- [ ] Calendar legible (white cells on dark bg ✓)
- [ ] Kanban columns visible (surface-soft adapts to blue tint)
- [ ] Toasts readable on dark bg
- [ ] Modals and backdrop correct
- [ ] Mobile drawer: dark sidebar slides in correctly
- [ ] No black-on-black text anywhere
