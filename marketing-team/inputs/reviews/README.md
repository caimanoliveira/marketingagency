# Reviews — Input folder

Mentee session feedback that the Creative Brief Writer + Content Writer agents can mine for real language patterns and validation quotes.

## Convention

```
reviews/
  2026-05-12_mentee-pm-pleno-fintech.md
  2026-05-10_mentee-banker-transicao.md
```

## What to include

- Verbatim review text (anonymized — no names, no employer names if confidential)
- Session topic/outcome (1 line)
- Permission flag: did the mentee consent to having content derived from this session? (default: no — assume confidential unless explicit yes)

## Template per file

```markdown
---
session_date: YYYY-MM-DD
mentee_profile: PM Pleno em fintech series B
session_topic: análise de oferta de scaleup vs banco
permission_to_use_as_content_inspiration: yes | no
---

## Verbatim review
> [paste mentee quote — exact words]

## Outcome
[1 line: what mentee decided / changed]

## Notes
[anything else relevant]
```

## Hard rule

Content agents may use phrasing patterns and decision archetypes from these files. They may NEVER quote a mentee directly in a post unless `permission_to_use_as_content_inspiration: yes` is set. Even then, anonymize.
