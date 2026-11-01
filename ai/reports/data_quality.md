# AEIOS data quality (Phase 2)

_Generated 2026-10-31 16:39 UTC from the local cache. CPCB values are reference-grade measurements by others; weather and CAMS are model output. None of this is AEIOS node data._

## Air-quality stations (OpenAQ)

Each station's legacy and live sensors are merged (the newer feed wins on overlap). The legacy feed is patchy: many stations have outages of months. Gaps do not disqualify a station because lag features tolerate them (they are missing, never filled), but they are listed so nobody assumes continuous data.

| station | provider | km | parameter | clean hours | winter hours | span | gap % between outages | longest gap (h) | outages > 30 d | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Najafgarh, Delhi - DPCC | CPCB | 10.6 | pm25 | 17078 | 4634 | 2018-12-20..2026-10-31 | 44.5 | 664 | 2019-01-03..2019-02-13; 2019-02-14..2019-04-27; 2019-05-03..2019-07-11; 2020-11-04..2021-01-05; 2021-03-22..2021-09-19; 2021-12-11..2025-02-18 | usable |
| Vikas Sadan, Gurugram - HSPCB | CPCB | 12.4 | pm25 | 14565 | 4950 | 2018-01-01..2026-10-31 | 50.0 | 415 | 2018-02-21..2018-04-16; 2018-05-14..2018-08-14; 2018-11-19..2018-12-20; 2019-01-03..2019-02-13; 2019-02-14..2019-04-27; 2019-05-03..2019-07-11; 2021-03-23..2021-12-08; 2021-12-08..2025-10-01 | usable |
| Sector-2 IMT, Manesar - HSPCB | CPCB | 13.4 | pm25 | 12045 | 3738 | 2019-01-02..2026-10-31 | 53.2 | 714 | 2019-01-03..2019-02-13; 2019-02-14..2019-04-27; 2019-05-03..2019-06-19; 2020-08-14..2020-09-13; 2020-11-12..2021-01-03; 2021-03-23..2021-09-01; 2021-12-19..2025-09-30 | usable |
| Sector-51, Gurugram - HSPCB | CPCB | 17.1 | pm25 | 9103 | 2427 | 2020-03-11..2026-10-31 | 56.0 | 499 | 2021-03-25..2021-07-14; 2021-07-23..2021-09-16; 2021-09-28..2021-11-19; 2021-11-19..2025-02-18; 2025-04-23..2025-09-29 | usable |
| NSIT Dwarka, Delhi - CPCB | CPCB | 19.2 | pm25 | 19817 | 5434 | 2018-04-16..2026-10-31 | 45.0 | 472 | 2018-05-14..2018-08-10; 2018-11-18..2018-12-20; 2019-01-03..2019-02-13; 2019-02-14..2019-04-27; 2019-05-02..2019-07-11; 2021-03-25..2021-06-21; 2021-06-21..2021-07-21; 2021-07-21..2021-09-01; 2021-12-20..2025-02-18 | usable |
| Dwarka-Sector 8, Delhi - DPCC | CPCB | 19.4 | pm25 | 19392 | 4946 | 2018-08-10..2026-10-31 | 43.0 | 501 | 2018-11-18..2018-12-20; 2019-01-03..2019-02-13; 2019-02-14..2019-04-27; 2019-05-03..2019-06-19; 2020-11-17..2021-01-04; 2021-03-19..2021-09-26; 2021-12-19..2025-02-18 | usable |
| Arya Nagar, Bahadurgarh - HSPCB | CPCB | 21.4 | pm25 | 12303 | 3751 | 2019-02-13..2026-10-31 | 55.8 | 702 | 2019-02-14..2019-04-27; 2019-05-02..2019-06-19; 2021-03-23..2021-07-23; 2021-07-25..2021-09-01; 2021-12-19..2025-09-28 | usable |
| Aya Nagar, New Delhi - IMD | CPCB | 22.2 | pm25 | 16925 | 4983 | 2018-05-03..2026-10-31 | 49.4 | 457 | 2018-05-10..2018-08-10; 2018-11-18..2018-12-20; 2019-01-03..2019-02-13; 2019-02-14..2019-04-30; 2019-05-02..2019-07-11; 2021-03-09..2021-07-17; 2021-07-17..2021-09-12; 2021-09-12..2021-10-31; 2021-12-13..2025-02-18 | usable |
| IGI Airport (T3), Delhi - IMD | CPCB | 22.9 | pm25 | 10754 | 2350 | 2025-02-18..2026-10-31 | 22.0 | 244 | 2025-06-06..2025-07-21 | usable |
| Teri Gram, Gurugram - HSPCB | CPCB | 24.4 | pm25 | 5753 | 1208 | 2020-03-30..2026-10-31 | 70.3 | 485 | 2021-03-25..2021-07-14; 2021-07-14..2021-09-01; 2021-09-01..2021-11-19; 2021-11-27..2025-02-18; 2025-04-01..2025-09-27 | insufficient |
| NISE Gwal Pahari, Gurugram - IMD | CPCB | 24.7 | pm25 | 11478 | 2351 | 2019-07-21..2026-10-31 | 30.7 | 432 | 2019-08-27..2019-10-02; 2019-10-07..2019-12-30; 2020-01-28..2020-03-05; 2020-03-05..2025-02-18 | usable |

## Weather and CAMS (Open-Meteo)

| variable | rows | first | last | null % |
|---|---|---|---|---|
| boundary_layer_height | 77424 | 2018-01-01 | 2026-10-31 | 5.6 |
| cams_aod | 37272 | 2022-08-01 | 2026-10-31 | 0.2 |
| cams_dust | 37272 | 2022-08-01 | 2026-10-31 | 0.2 |
| cams_pm10 | 37272 | 2022-08-01 | 2026-10-31 | 0.2 |
| cams_pm2_5 | 37272 | 2022-08-01 | 2026-10-31 | 0.2 |
| cloud_cover | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| dew_point_2m | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| precipitation | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| relative_humidity_2m | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| surface_pressure | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| temperature_2m | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| wind_direction_10m | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| wind_speed_100m | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |
| wind_speed_10m | 77424 | 2018-01-01 | 2026-10-31 | 0.0 |

**Months with no values at all** (source gaps; features depending on these are missing, not imputed):

- `boundary_layer_height`: 2024-01 .. 2024-06 (6 months)

## Feature rows and leakage audit

Windows: train targets until 2025-10-01; calibration origins 2025-10-01..2026-01-16; test origins from 2026-01-16. Rows whose target straddles a window edge are dropped.

### Najafgarh, Delhi - DPCC (station 10488)

| horizon | rows | train | calibration | test | leakage audit |
|---|---|---|---|---|---|
| +1 h | 15342 | 8633 | 1856 | 4853 | clean |
| +3 h | 14704 | 8287 | 1793 | 4622 | clean |
| +6 h | 14315 | 8039 | 1769 | 4503 | clean |
| +12 h | 13864 | 7723 | 1739 | 4395 | clean |
| +24 h | 14039 | 7730 | 1787 | 4514 | clean |

### Vikas Sadan, Gurugram - HSPCB (station 301)

| horizon | rows | train | calibration | test | leakage audit |
|---|---|---|---|---|---|
| +1 h | 12586 | 6608 | 1721 | 4257 | clean |
| +3 h | 11830 | 6410 | 1577 | 3843 | clean |
| +6 h | 11486 | 6231 | 1563 | 3692 | clean |
| +12 h | 11110 | 6023 | 1535 | 3552 | clean |
| +24 h | 11086 | 5806 | 1646 | 3634 | clean |

### Sector-2 IMT, Manesar - HSPCB (station 6953)

| horizon | rows | train | calibration | test | leakage audit |
|---|---|---|---|---|---|
| +1 h | 10258 | 4501 | 1587 | 4170 | clean |
| +3 h | 9645 | 4328 | 1452 | 3865 | clean |
| +6 h | 9311 | 4140 | 1422 | 3749 | clean |
| +12 h | 9071 | 3998 | 1411 | 3662 | clean |
| +24 h | 9162 | 3923 | 1496 | 3743 | clean |

