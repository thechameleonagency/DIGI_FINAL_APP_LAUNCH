# DigiSwasthya world seed — demo accounts

All seeded logins use password **`Demo@1234`**.

Source of truth: `cast.ts` (people + businesses) and `registry.ts` (`buildCastSeedAccountDirectory`).
Pending pharmacy has no delivery staff invite (business stays `PendingActivation`).

| Email | Role | Portal | Business |
| --- | --- | --- | --- |
| `superadmin@digiswasthya.demo` | SuperAdmin | admin | DigiSwasthya Platform |
| `support@digiswasthya.demo` | SupportManager | admin | DigiSwasthya Platform |
| `stockist.a.owner@digiswasthya.demo` | Stockist | stockist | Mehta Distributors Mumbai |
| `stockist.a.delivery@digiswasthya.demo` | DeliveryStaff | stockist | Mehta Distributors Mumbai |
| `stockist.b.owner@digiswasthya.demo` | Stockist | stockist | Deshmukh Pharma Pune |
| `stockist.b.delivery@digiswasthya.demo` | DeliveryStaff | stockist | Deshmukh Pharma Pune |
| `pharmacy.a.owner@digiswasthya.demo` | Pharmacist | pharmacy | Sharma Medicals Mumbai |
| `pharmacy.a.delivery@digiswasthya.demo` | DeliveryStaff | pharmacy | Sharma Medicals Mumbai |
| `pharmacy.b.owner@digiswasthya.demo` | Pharmacist | pharmacy | Rao Chemists Pune |
| `pharmacy.b.delivery@digiswasthya.demo` | DeliveryStaff | pharmacy | Rao Chemists Pune |
| `pharmacy.c.owner@digiswasthya.demo` | Pharmacist | pharmacy | Kulkarni Medical Nashik |
| `pharmacy.c.delivery@digiswasthya.demo` | DeliveryStaff | pharmacy | Kulkarni Medical Nashik |
| `pharmacy.pending.owner@digiswasthya.demo` | Pharmacist | pharmacy | Gupta Medico Pending |

## Notes

- Login panel lists these when `seedMeta.worldSeedVersion === WORLD_SEED_VERSION`.
- Admin **Rebuild demo world** calls `resetAndSeedWorld()` (clear + full pipeline).
- Managed offline / invite pharmacies (`CAST.managedOffline`, `CAST.managedInvite`) are not login users.
- Cast email `pharmacy.pending.delivery@digiswasthya.demo` is unused (no invite while pending).
