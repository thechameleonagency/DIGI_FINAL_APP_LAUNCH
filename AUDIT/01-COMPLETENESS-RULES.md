# 01 — Completeness Rules

Binding rules for DigiSwasthya. A feature is **Done** only when all rules pass.

## 1. End-to-end ownership

Every feature must have:

1. **Entry** — nav, More card, topbar, deep-link, or notification.
2. **Action** — user can perform the verb (create/edit/decide/export).
3. **Persistence** — Dexie write via a service with `assertCan` + audit where required.
4. **Feedback** — toast and/or success summary; errors with business impact.
5. **States** — empty, loading/busy, error, and data-present for every list/detail.

## 2. No orphans

- No page without a reachable entry.
- No service without at least one UI caller (or explicit admin/system-only note).
- No nav item that duplicates a More hub destination (see change spec §E).
- No modal/sheet that cannot be dismissed (Esc + close control).

## 3. Lifecycle integrity

Document numbers unique and monotonic. State transitions go through machines. Money/stock changes leave movements or allocations. Rate changes never rewrite historical order-line snapshots.

## 4. Role honesty

UI `can()` may use role preview; mutations always use real `user.role`. Impersonation is read-only. Pharmacy never sees commission breakouts.

## 5. Inventory status values

| Status | Meaning |
|---|---|
| `Exists` | Reachable, functional, states covered |
| `Partial` | Core works; canvas polish or secondary path incomplete |
| `Missing` | Specced but not shipped |
| `Remove` | Must be deleted from all roles |

## 6. Pass criterion for AUDIT closure

Every row in `03-UI-SURFACE-INVENTORY` is `Exists` or intentionally `Remove` (executed). Every backlog item in `05` has evidence (test file or e2e name).
