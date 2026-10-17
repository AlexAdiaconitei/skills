# Loose-thread lenses

Read this file only while you research the repository. Apply every lens that can change scope, architecture, execution order, acceptance, rollout or reversibility. For each one, record a concrete finding or the reason it does not apply. Do not copy the checklist itself into the dossier.

## Problem and boundary

- The outcome the user sees, and what fails or is missing today.
- In-scope and out-of-scope behavior.
- Actors, permissions, tenancy, and ownership boundaries.
- Existing behavior that must remain invariant.
- Product decisions hidden inside apparently technical work.

## Existing system

- Current entry points, exported symbols, routes, jobs, schemas, and state owners.
- Repository conventions and the nearest analogous implementation.
- Callers and downstream consumers of every changed contract.
- Configuration, feature flags, generated code, build steps, and deployment units.
- Documentation, issue, ADR, or prior plan that constrains the work.

## Contracts and data

- Compatibility of APIs, requests, responses and events.
- Data model, migrations, backfill, defaults, nullability, indexes, retention, and deletion.
- Ordering, idempotency, retries, concurrency, transactions, and partial failure.
- Serialization, versioning, cache invalidation, and stale clients.
- Import, export and external integration contracts.

## Quality attributes

- Authentication, authorization, secrets, privacy, and abuse paths.
- Latency, throughput, memory, allocation, query count, and payload growth.
- Accessibility, keyboard behavior, responsive layout, localization, and reduced motion.
- Observability needed to distinguish success, degradation, and rollback conditions.
- Availability and behavior when dependencies are slow or unavailable.

## Delivery

- Dependency order and independently reviewable slices.
- Rollout, compatibility window, migration sequencing, feature flags, and rollback.
- Environment or infrastructure changes.
- Operational ownership and support burden.
- Complexity and uncertainty, kept separate from calendar estimates.

## Verification

- Observable acceptance criteria for each changed behavior.
- Existing tests that cover the contract and missing tests only where a new contract is introduced.
- Smoke scenario that exercises the real changed path.
- Failure, boundary, precedence, and transition cases.
- Manual or visual checks that automated tests cannot cover.

## Closure test

Research is done only when:

- every affected surface has an owner in the proposed plan;
- every dependency is ordered or explicitly parallel;
- every material risk has prevention, detection, or rollback;
- every unknown is a decision, investigation, blocked thread, or explicit deferral;
- every implementation phase has a verifiable completion criterion;
- no question remains that repository tools could answer.
