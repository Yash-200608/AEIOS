# Interface Control Documents (ICD) — Index

**Status:** ICD-001 / ICD-002 active post–Gate B; ICD-003 / ICD-004 remain placeholders  
**Date:** 2026-08-01  

| ICD ID | Interface | Governing doc | Status |
|--------|-----------|---------------|--------|
| [ICD-001](ICD-001-node-mesh.md) | Node ↔ Mesh (on-air binary) | DOC-005 | **Active v1.0** |
| [ICD-002](ICD-002-mesh-gateway.md) | Mesh bridge ↔ Gateway ingest | DOC-005 + SAD §6 | **Active v1.0** |
| [ICD-003](ICD-003-gateway-backend.md) | Gateway services ↔ Backend API | OpenAPI (TBD) | Placeholder |
| [ICD-004](ICD-004-backend-dashboard.md) | Backend ↔ Dashboard | REST + WebSocket (TBD) | Placeholder |

## Rules

1. ICD-001/002 MUST NOT contradict DOC-005 on-wire layout.  
2. ICD changes require version bump per [VERSIONING.md](../VERSIONING.md).  
3. Each ICD states: messages/fields, timing, error handling, security, ownership.
