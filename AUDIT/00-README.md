# AUDIT — DigiSwasthya Application Audit & Spec

**Status:** Active source of truth for forward work (2026-08-01).  
**App:** `app/` (Vite + React + TypeScript + Dexie).  
**Reference:** `docs/` Parts 1–20 + `docs/22` (normative PDD); completed gap ledger in `PLAN/13`, `PLAN/14`, `PLAN/BUILD-STATUS`.

## Purpose

This folder is the **living audit and product-change instruction set**. Use it to:

1. Prove every UI surface has an entry path, data source, action, persistence, and feedback (empty / loading / error / success).
2. Drive implementation of product changes (offline pharmacies, baked-in commission pricing, nav/More, sheets).
3. Prevent half-built features from being marked done.

## How to run an audit

1. Read [01-COMPLETENESS-RULES.md](./01-COMPLETENESS-RULES.md).
2. Walk journeys in [02-JOURNEYS-AND-LIFECYCLES.md](./02-JOURNEYS-AND-LIFECYCLES.md) for each role.
3. Tick every row in [03-UI-SURFACE-INVENTORY.md](./03-UI-SURFACE-INVENTORY.md) (`Exists` | `Partial` | `Missing` | `Remove`).
4. Implement against [04-PRODUCT-CHANGE-SPEC.md](./04-PRODUCT-CHANGE-SPEC.md) and [05-IMPLEMENTATION-BACKLOG.md](./05-IMPLEMENTATION-BACKLOG.md).
5. Record gaps in [06-GAP-FINDINGS.md](./06-GAP-FINDINGS.md).

## Relation to other folders

| Location | Role |
|---|---|
| `AUDIT/` | Forward audit + change specs (this folder) |
| `AUDIT/archive/legacy-plan/` | Superseded PLAN/00–12 |
| `PLAN/13`, `PLAN/14`, `PLAN/BUILD-STATUS` | Historical gap-closure completion proof |
| `docs/` | PDD reference — do not edit Parts 1–20 unless explicitly requested |
| `html/` | Design canvases — reference only, never edit |
| `app/` | Only implementation surface |

## Demo credentials (seed)

| Role | Email | Password |
|---|---|---|
| SuperAdmin | `admin@digiswasthya.in` | `Admin@2026` |
| Stockist Owner | `vikram@medroute.in` | `Stockist@2026` |
| Pharmacy Owner | `neha@careplus.pune.in` | `Pharmacy@2026` |

OTP: `123456`.
