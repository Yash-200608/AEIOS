# AMP Golden Vectors

**Source:** DOC-005 §15 / `firmware/host_tests/golden_ref.py`  
**K_net:** `11` repeated 16 times  

## HEARTBEAT sample

Header fields: type=0x02, src=0x0010, dst=0x0002, ttl=8, seq=1, timestamp=1710000000, payload_len=8  

Payload: `5a 00 01 32 02 00 01 00`  

```
ae0102000800100002000000080001008087ec655a00013202000100e7e4a1d0ef7709a7861c
```

- CRC-16 (LE on wire): `e7 e4` (value 0xE4E7)  
- MAC trunc64: `a1 d0 ef 77 09 a7 86 1c`  

## Checks

| Check | Result |
|-------|--------|
| SHA-256("abc") FIPS | PASS (Python ref) |
| MAC stable under hop-field mutate | PASS |
| C host suite | Requires CMake+C11 (`firmware/host_tests`) |
