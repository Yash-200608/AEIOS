# Pull Request Evidence Checklist

Use this template for every PR to `main` (GOV-EXEC-001 — No Untested Code Enters Main).

## Summary

- [ ] Implements against controlled doc(s): _______________
- [ ] ADR required? No / Yes (ADR-___ )

## Tests

- [ ] Unit / host / Unity test added or updated  
- [ ] VT ID(s): _______________  
- [ ] Manual-only testing is **not** the sole evidence  

## Evidence attached or linked

- [ ] CI / command output  
- [ ] Log excerpt / golden hex / screenshot as applicable  
- [ ] Build artifact note (for firmware: binary path or `idf.py build` log)

## Reviewer four questions

| # | Question | Yes |
|---|----------|-----|
| 1 | Faithful to controlled document? | ☐ |
| 2 | Tested? | ☐ |
| 3 | Objective evidence present? | ☐ |
| 4 | Acceptance / VT criteria met? | ☐ |

**Merge blocked** if any row is No.
