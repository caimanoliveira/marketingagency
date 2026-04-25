# Centro de Comando — Semana 11: Optimal Send Time + Variant Memory — Implementation Plan

**Goal:** Fechar mais dois loops: timing e copy. (1) `post_metrics` agregado por (weekday, hour) → heatmap + chip "melhor horário" no editor. (2) Lembrar qual variante de copy da IA o usuário aceitou → realimentar prompt da agenda semanal com "ganchos vencedores".

**Why now:** W10 fechou o loop de tema (pilares). W11 fecha os outros dois eixos de um post — quando publicar e qual frase usar — multiplicando o sinal de pilares.

---

## DB — `migrations/0010_send_times_variants.sql`

```sql
CREATE TABLE ai_variant_outcomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  generation_id TEXT,        -- optional link to ai_generations
  network TEXT,              -- if user picked a network-specific variant
  tone TEXT,                 -- if applicable
  variant_text TEXT NOT NULL,
  post_id TEXT,              -- where it landed
  applied_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_variant_outcomes_user_applied ON ai_variant_outcomes(user_id, applied_at DESC);
CREATE INDEX idx_variant_outcomes_post ON ai_variant_outcomes(post_id);
```

Não precisa de tabela pra send-times — agregado direto de `post_metrics` joinado com `post_targets.published_at`.

---

## Tasks

### 1. Optimal send time — query + API + tests
- [ ] `getBestSendTimes(db, userId, network, windowDays)` retorna `Array<{ weekday, hour, sampleSize, avgEngagementRate }>`
- [ ] `GET /api/analytics/send-times?network=...&window=30` → tabela 7×24
- [ ] Tests: agregação correta, filtro por network, isolamento user

### 2. Editor "best time" chip
- [ ] Componente `BestTimeChip({ network, onPick })` consome o endpoint, mostra top 3 horários ordenados por engagement
- [ ] Inserir ao lado do `<Schedule>` no editor
- [ ] Click → `setSchedules` com timestamp do próximo `weekday@hour`

### 3. Heatmap em /analytics
- [ ] Componente `SendTimesHeatmap` renderiza grid 7×24 com opacity ∝ avgEngagementRate
- [ ] Tooltip on hover: "Quarta 14h, n posts, X% engagement"

### 4. AI variant memory
- [ ] Migration table `ai_variant_outcomes`
- [ ] Quando usuário aplica uma variante (AIAssistant onApply), `POST /api/ai/variants/applied` registra `{ network?, tone?, variantText, postId? }`
- [ ] Strategy agent prompt: nova seção "Ganchos que viraram post na última semana" puxa de `ai_variant_outcomes JOIN post_metrics` (top por engagement)

### 5. Pillar performance split by network
- [ ] Refactor `getPillarPerformance` → adicionar variant `getPillarPerformanceByNetwork(userId, windowDays)` retornando `Array<{ pillarId, network, avgEngagementRate, postCount }>`
- [ ] UI strip da W10 ganha tabs por rede
- [ ] Strategy prompt usa o split quando o número de samples por (pilar, rede) ≥ 3

### 6. Deploy
- [ ] Apply migration
- [ ] Smoke test
- [ ] Tag week-11-done

---

## Known limitations
- Heatmap sofre com poucos dados — exibimos só células com sampleSize ≥ 1, mas com bias óbvio. Mitigação no UI: chip só sugere top horários com sampleSize ≥ 3.
- `ai_variant_outcomes` só captura quando o usuário clica "aplicar" no AIAssistant — uso fora desse fluxo não é trackeado.
- Split por rede + pilar pode resultar em buckets pequenos demais. Strategy prompt cai pro score account-wide quando isso ocorre.
