# Centro de Comando — Semana 10: Fechando o Loop — Pillar Performance — Implementation Plan

**Goal:** O agente da semana 9 planeja, mas não aprende. Fechar o loop: cada post carrega o pilar que o originou → analytics agrega engagement por pilar → agente usa esse sinal pra decidir quanto peso dar a cada pilar na próxima agenda.

**Why now:** Week 9 limitations.md já listou "Não aprende com aceites/rejeições — feedback loop fica pra iteração futura". Toda a infra existe (post_metrics, pillars, weekly_suggestions) — o que falta é a amarra: `posts.pillar_id`. Sem isso, dados ficam em silos e o agente planeja cego.

**Architecture:**
- **Amarra:** coluna `pillar_id` em `posts` (nullable FK). Approval flow persiste o pilar sugerido. Editor expõe seletor.
- **Score:** `getPillarPerformance(userId, windowDays)` faz JOIN posts → post_targets → post_metrics e agrega por pilar (avg engagement_rate, total reach, count).
- **UI:** strip de "Pillar ROI" no topo da página /strategy, ordenado por avg engagement, com sparkline dos últimos 4 snapshots semanais.
- **Loop:** `strategy.ts` injeta a tabela de performance no prompt do agente. System prompt ganha instrução explícita de usar esses scores pra ponderar a distribuição de posts por pilar.
- **Backfill opcional:** botão "Classificar posts antigos" que roda Claude Haiku uma vez sobre cada post sem `pillar_id` e sugere o pilar mais próximo (user confirma em bulk).

---

## DB — `migrations/0009_post_pillars.sql`

```sql
ALTER TABLE posts ADD COLUMN pillar_id TEXT REFERENCES content_pillars(id);
CREATE INDEX idx_posts_pillar ON posts(pillar_id) WHERE pillar_id IS NOT NULL;
```

---

## Task 1: Schema + types + queries (TDD)

- [ ] Write migration + apply local
- [ ] Extend `Post` type with `pillarId: string | null`
- [ ] Update `createPost`, `updatePost`, `getPost`, `listPosts` to round-trip `pillar_id`
- [ ] New query `getPillarPerformance(db, userId, windowDays)` returns `Array<{ pillarId, title, color, postCount, avgEngagementRate, totalReach, totalLikes, totalComments }>` — LEFT JOIN so pilares sem posts aparecem com zeros
- [ ] New query `getPillarPerformanceWeekly(db, userId, weeks)` returns por-semana-por-pilar pra sparkline
- [ ] Tests: isolação por user; post sem pilar não aparece no breakdown; post publicado sem metrics conta postCount mas não engagement
- [ ] Commit

## Task 2: Approval flow persiste pilar

- [ ] `POST /api/strategy/weekly-suggestions/:id/approve` — no loop que cria `posts`, incluir `pillar_id` do `SuggestedPost` (se presente e pertencer ao user)
- [ ] Validar que o `pillarId` sugerido pelo LLM existe em `content_pillars` — se inválido, gravar null + logar
- [ ] Tests: post criado carrega pillar_id correto; pillar_id inexistente vira null sem 500
- [ ] Commit

## Task 3: Editor UI — seletor de pilar

- [ ] No editor de post, adicionar dropdown "Pilar" ao lado do status
- [ ] Opções: lista de pillars do user + "— sem pilar —"
- [ ] Salvar no `PATCH /api/posts/:id`
- [ ] Tests: componente renderiza opções, onChange chama API
- [ ] Commit

## Task 4: Pillar ROI strip na página /strategy

- [ ] `GET /api/strategy/pillars/performance?window=30` → retorna array da query + weekly sparkline data
- [ ] Componente `PillarPerformanceStrip`:
  - Cards horizontais, um por pilar, ordenados por avgEngagementRate desc
  - Cada card: cor do pilar, título, número grande (avg engagement %), sparkline 4-semana, pill com "N posts"
  - Empty state: "Aprove posts do agente ou classifique posts antigos pra ver performance"
- [ ] Inserir no topo de `/strategy`, acima da lista de pilares
- [ ] Tests
- [ ] Commit

## Task 5: Agente usa scores (feedback loop)

- [ ] Em `src/worker/ai/strategy.ts`, carregar `getPillarPerformance(userId, 30)` junto do restante do contexto
- [ ] Passar `pillarPerformance` pro `userForStrategy` (novo campo)
- [ ] Atualizar `systemForStrategy` com instrução: "Quando houver dados de performance por pilar, distribua os posts da semana priorizando os 2 pilares de maior engagement médio (≈60% dos posts), mantendo 1 post mínimo em cada pilar restante pra evitar colapso de diversidade."
- [ ] Atualizar `userForStrategy` pra renderizar a tabela de performance num bloco estruturado
- [ ] `rationale` no output deve explicar a distribuição em função dos scores
- [ ] Tests: mock Claude, verificar que prompt contém os scores; distribuição recomendada respeita regras (floor de 1 por pilar)
- [ ] Commit

## Task 6: Classificação em massa de posts antigos (opcional mas barato)

- [ ] `POST /api/strategy/backfill-pillars` — lista posts publicados sem `pillar_id`, para cada um chama Claude Haiku com body + lista de pillars → retorna `pillarId | null`. Salva direto (user confirma depois)
- [ ] UI: botão "Classificar posts antigos" no topo da strip; mostra progresso e diff "X posts classificados, Y pularam"
- [ ] Proteção: só roda uma vez por user a cada 24h (rate-limit simples em memória / D1)
- [ ] Tests: mock Claude; confirma que pular posts sem body vazio funciona
- [ ] Commit

## Task 7: Deploy

- [ ] Apply migration remote
- [ ] Deploy worker + web
- [ ] Smoke test: criar pilar → aprovar sugestão → classificar posts antigos → ver strip preenchida → rodar /generate → checar que rationale cita scores
- [ ] Tag `week-10-done`

---

## Known limitations

- Score é account-wide, não por rede — pilar A pode performar bem no LinkedIn e mal no IG e o score médio esconde isso. Split por rede fica pra w11.
- Sem intervalo de confiança — um pilar com 1 post de sorte pode dominar o ranking. Mitigação no prompt: instrução pra exigir min 3 posts antes de reponderar.
- Haiku pra backfill pode classificar errado posts ambíguos — por isso é gravado direto mas o user pode trocar pelo seletor do editor.
- Engagement rate depende do collector de metrics estar rodando (w7) — sem snapshots frescos, scores ficam congelados. Não é novo, mas fica mais visível.
- Não removemos a sugestão de pilar do LLM quando ele cita ID inválido — logamos e seguimos. Se ficar frequente, vira validação dura.

---

## Follow-ups já mapeados (roadmap GitHub issues)

- W11: optimal send time + variant memory
- W12: visual creation (AI image + video thumb + templates)
- W13: approval workflow (magic-link reviewer)
- W14: audience intelligence
- W15: workspaces + token encryption
