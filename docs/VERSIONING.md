# AEIOS Versioning Policy

**Document:** VERSIONING.md  
**Version:** 1.0  
**Status:** Active (post–Gate A)  
**Effective:** 2026-08-01  

---

## 1. Purpose

Keep software, firmware, hardware, protocol, and controlled documents aligned so that a deployed system can be identified unambiguously.

---

## 2. Semantic versioning (software & firmware)

Format: `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

| Part | When to bump |
|------|----------------|
| MAJOR | Incompatible API, protocol, or on-wire behavior; Gate C boundary change that breaks clients |
| MINOR | Backward-compatible feature addition |
| PATCH | Backward-compatible bug fix |

Pre-release tags: `-alpha.N`, `-beta.N`, `-rc.N` (e.g., `1.0.0-rc.1`).

**Components with independent versions:**

| Component | Version location (when implemented) |
|-----------|-------------------------------------|
| Node firmware | `firmware/` version header / app description |
| Gateway stack | Compose / package versions + `gateway` service version |
| Backend API | OpenAPI `info.version` |
| Dashboard | `frontend` package.json version |
| AI models | Model artifact semver + training metadata |

---

## 3. Document revisions

Controlled documents use `Document ID` + `Version` (e.g., DOC-002 v1.1).

| Change type | Version bump |
|-------------|--------------|
| Typos / clarification only | PATCH (1.0 → 1.0.1) or note in changelog; prefer 1.0.1 |
| Additive requirements / sections | MINOR (1.0 → 1.1) |
| Breaking requirement or scope change | MAJOR (1.0 → 2.0) + design review |

After Gate A, DOC-001 / DOC-002 / DOC-004 changes require design review. Architectural changes also require ADR update.

Each controlled doc SHALL carry: Document ID, Version, Status, last change date.

---

## 4. ADR numbering

- Format: `ADR-NNN` zero-padded (ADR-001 …)  
- Numbers are **never reused**  
- Superseding an ADR: new ADR references the old; old status → `Superseded by ADR-XXX`  
- Accepted ADRs are immutable except status/review-history appends  

---

## 5. Protocol revisions (DOC-005)

On-wire `Protocol Version` field (see DOC-005):

| Protocol Version | Meaning |
|------------------|---------|
| 1 | First frozen Gate B binary layout |

Rules:

- Any incompatible frame layout → new Protocol Version + MAJOR note in DOC-005  
- Compatible additive packet types may use flags/type codes within same Protocol Version if receivers ignore unknown types safely  
- Firmware and gateway parser MUST negotiate/reject unsupported versions explicitly  

Document revision of DOC-005 is independent of on-wire Protocol Version but MUST state which on-wire versions it defines.

---

## 6. Hardware revisions

Format: `HW-NODE-rN` / `HW-GW-rN` (e.g., `HW-NODE-r1`).

| Event | Action |
|-------|--------|
| PCB/schematic change affecting pinout or BOM form-fit | New hardware revision |
| Sensor set change (e.g., add/remove instrument) | New HW revision + ADR if architectural |
| Radio family change (e.g., SX127x → SX126x) | New HW revision + mandatory ADR |

BOM files SHALL name the hardware revision they apply to.

---

## 7. Release identifiers

A **system release** string binds components:

```text
AEIOS-Sentinel-v{MAJOR.MINOR.PATCH}
  firmware={...}
  gateway={...}
  protocol={on-wire N}
  docs={charter x.y, srs x.y, ...}
  hw-node={HW-NODE-rN}
```

Used in validation reports and field tags.

---

## 8. Changelog

Maintain `CHANGELOG.md` at repo root once implementation starts (Keep a Changelog style). Document-only eras may log under `docs/CHANGELOG.md`.

---

## 9. Approval

| Role | Date |
|------|------|
| Governance | 2026-08-01 |
