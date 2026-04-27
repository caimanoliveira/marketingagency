# Lume — Semana 10: Redesign UX Completo — Implementation Plan

**Goal:** Transformar o app de "funcional mas sem alma" para uma experiência Airbnb-like (warm, editorial, spacious) com identidade própria **Lume**, mobile-responsive sério, e polish de produção.

**Stack visual:**
- **Tema padrão:** Light mode (Airbnb-like)
- **Primary:** `#E85D1F` (Lume orange)
- **Tipografia:** Inter (300/400/500/600/700) via Google Fonts
- **Design tokens:** variáveis CSS custom properties com namespace `--lume-*`
- **Breakpoints:** 640 / 768 / 1024 / 1280 (mobile-first)
- **Radius:** generoso (8/12/16 em cards, botões 12px)
- **Shadows:** 3 níveis sutis, Airbnb-style (soft, nunca dramatic)

---

## Fase 1: Brand + Design Tokens + Tema Light

**Files:**
- Modify: `src/web/styles.css` — substituir completamente pelo novo sistema
- Modify: `src/web/index.html` — carregar Inter, meta tags, title "Lume"
- Create: `src/web/components/Logo.tsx` — wordmark + icon SVG
- Create: `src/web/lib/theme.ts` — (futuro: toggle dark; semana 10 só light)

**Design tokens (CSS custom properties):**
```css
:root {
  /* Colors — warm palette */
  --lume-primary: #E85D1F;
  --lume-primary-hover: #D14D12;
  --lume-primary-active: #B8420C;
  --lume-primary-soft: #FEF1E9;       /* bg wash */
  --lume-primary-soft-hover: #FDE4D3;

  --lume-bg: #FFFCFA;                 /* page background */
  --lume-surface: #FFFFFF;            /* cards */
  --lume-surface-soft: #F7F4F0;       /* subtle sections */

  --lume-border: #EBE6E1;
  --lume-border-strong: #D6CDC4;
  --lume-border-focus: #E85D1F;

  --lume-text: #1A1511;               /* headings, body */
  --lume-text-muted: #6F6A64;         /* secondary */
  --lume-text-soft: #9C968F;          /* tertiary */

  --lume-success: #15803D;
  --lume-success-bg: #E7F5EC;
  --lume-warning: #C2410C;
  --lume-warning-bg: #FEF3EA;
  --lume-danger: #B91C1C;
  --lume-danger-bg: #FEEBEB;

  /* Radius */
  --lume-radius-sm: 6px;
  --lume-radius-md: 10px;
  --lume-radius-lg: 16px;
  --lume-radius-xl: 24px;
  --lume-radius-full: 9999px;

  /* Spacing scale (4px base) */
  --lume-space-1: 4px;
  --lume-space-2: 8px;
  --lume-space-3: 12px;
  --lume-space-4: 16px;
  --lume-space-5: 24px;
  --lume-space-6: 32px;
  --lume-space-8: 48px;
  --lume-space-10: 64px;

  /* Shadows (Airbnb-like) */
  --lume-shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --lume-shadow-md: 0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  --lume-shadow-lg: 0 16px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
  --lume-shadow-focus: 0 0 0 3px rgba(232,93,31,0.25);

  /* Type scale */
  --lume-font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  --lume-text-xs: 12px;
  --lume-text-sm: 13px;
  --lume-text-base: 15px;
  --lume-text-lg: 18px;
  --lume-text-xl: 22px;
  --lume-text-2xl: 28px;
  --lume-text-3xl: 36px;

  /* Transitions */
  --lume-transition: 150ms ease;
}
```

- Commit: `feat(lume): design tokens + Inter + light theme base`

---

## Fase 2: Component Library

**Files:**
- Create: `src/web/ui/Button.tsx` — variants (primary, secondary, ghost, danger) + sizes (sm/md/lg)
- Create: `src/web/ui/Input.tsx` — label, helper, error
- Create: `src/web/ui/Select.tsx`
- Create: `src/web/ui/Textarea.tsx`
- Create: `src/web/ui/Card.tsx` — wrapper semântico
- Create: `src/web/ui/Badge.tsx` — network pills, status
- Create: `src/web/ui/Avatar.tsx`
- Create: `src/web/ui/Toast.tsx` + `src/web/ui/toast-store.ts` — replace `alert()`
- Create: `src/web/ui/Modal.tsx` + `src/web/ui/Sheet.tsx` (mobile bottom sheet)
- Create: `src/web/ui/Tabs.tsx`
- Create: `src/web/ui/Dropdown.tsx`
- Create: `src/web/ui/Skeleton.tsx` — revisar existente
- Create: `src/web/ui/EmptyState.tsx` — revisar existente (melhor ilustração)

Todos os componentes usam os tokens CSS. API próxima a Radix-style mas lean (sem lib externa — só HTML semântico + CSS).

- Commit: `feat(lume): component library (button, input, card, badge, toast...)`

---

## Fase 3: Layout + Navigation

**Files:**
- Modify: `src/web/components/Layout.tsx`
- Create: `src/web/components/TopNav.tsx` — logo + search + user menu
- Create: `src/web/components/Sidebar.tsx` — desktop sidebar + mobile drawer
- Create: `src/web/components/UserMenu.tsx` — avatar dropdown

**Layout behavior:**
- Desktop (≥1024px): sidebar fixa 240px + topnav minimalista + content
- Tablet (768-1023): sidebar retrátil (ícones) + content
- Mobile (<768px): top nav full, menu via hamburger → drawer lateral

- Commit: `feat(lume): responsive layout with sidebar drawer`

---

## Fase 4: Page Redesigns (em ordem de impacto)

Cada página vira um commit próprio. Princípios:
- Substituir `style={{}}` inline por classes/design tokens
- Usar componentes da Fase 2
- Replace `alert()`/`confirm()` por Toast + Modal
- Hierarquia tipográfica clara (h1 → h2 → body → caption)
- Espaço respirar (padding generoso, whitespace)

Ordem:
1. `PostsList.tsx` — página mais usada; table → cards responsivos
2. `Editor.tsx` — redesign do split layout, melhor foco
3. `Calendar.tsx` — cells mais generosas, melhor visual
4. `Kanban.tsx` — cards bonitos, drop targets claros
5. `Strategy.tsx` — seções mais separadas, cards elegantes
6. `Benchmarks.tsx` — list → cards com avatar grande
7. `Analytics.tsx` — KPI cards com ícones, charts com grid sutil
8. `Media.tsx` — galeria mais aberta, tile com overlay
9. `Settings.tsx` — formulários alinhados

- Commits separados por página ou agrupados por 2-3

---

## Fase 5: Mobile Responsive Pass

- Testar cada página em 375px (iPhone SE), 390px (iPhone 14), 768px (iPad)
- Editor: painel de preview vira tab mobile
- Tabelas: viram stack de cards em mobile
- Formulários full-width em mobile
- Touch targets ≥ 44px

- Commit: `feat(lume): mobile responsive refinements`

---

## Fase 6: Polish Final

- Toasts substituindo todos os `alert()`/`confirm()`
- Focus rings consistentes (`--lume-shadow-focus`)
- Hover states (subtle background change)
- Transições 150ms em botões/cards interativos
- Skeleton loaders refinados
- Empty states com ilustrações SVG (não só emoji)
- Meta tags / favicon / OG image com identidade Lume

- Commit: `feat(lume): polish — toasts, focus, transitions, favicon`

---

## Fase 7: Deploy

- `npm run deploy`
- Smoke test responsivo
- Tag `week-10-lume`

---

## Known limitations / future
- Dark mode: deferred
- Animações complexas: só o básico
- Custom ilustrações SVG: genéricas por enquanto
- i18n: só PT-BR
