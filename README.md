# Campus Notification Engine

A clean-room rebuild of a campus notification engine based on reverse-engineering observations of Novu's notification infrastructure.

## Current status

The reverse-engineering and product specification phase is complete. The repository currently contains the required design and evidence documents under `docs/`. The implementation phase follows the documentation phase.

## Required documentation

- `docs/OBSERVATIONS.md` — verified reverse-engineering observations
- `docs/PRD.md` — product requirements and acceptance criteria
- `docs/ARCHITECTURE.md` — rebuild architecture
- `docs/DATA_MODEL.md` — entities and constraints
- `docs/API.md` — API surface
- `docs/GAPS.md` — original gaps and rebuild improvements
- `docs/AGENT_LOG.md` — agent/research log

## Clean-room constraint

The rebuild is based on documented observations and requirements. Original Novu source code is not copied into this repository.

## Rebuild focus

The core notification flow is event → workflow → preference check → delivery → activity/inbox tracking, with burst digestion and retry behavior.

## Key tests

1. Ten events within five minutes become one digest.
2. A user who muted email receives in-app only.
3. A failed send is retried without creating duplicates.

## Improvements

- Gap fix: atomic workflow/control-value writes.
- Differentiator: academic-calendar-aware digest scheduling.
