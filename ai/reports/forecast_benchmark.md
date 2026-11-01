# PM2.5 forecast benchmark

_Generated 2026-10-31 16:46 UTC on Windows AMD64, Python 3.12.10; feature set `base`; stations: Najafgarh, Delhi - DPCC, Vikas Sadan, Gurugram - HSPCB, Sector-2 IMT, Manesar - HSPCB, Sector-51, Gurugram - HSPCB, NSIT Dwarka, Delhi - CPCB, Dwarka-Sector 8, Delhi - DPCC, Arya Nagar, Bahadurgarh - HSPCB, Aya Nagar, New Delhi - IMD, IGI Airport (T3), Delhi - IMD, NISE Gwal Pahari, Gurugram - IMD._

Forecasts of **CPCB station PM2.5** near Gurugram. They are not AEIOS node measurements, and no field-accuracy claim is made about the nodes. Windows: train targets until 2025-10-01; calibration origins 2025-10-01..2026-01-16; test origins from 2026-01-16.

## Summary

| horizon | LightGBM MAE | best baseline | baseline MAE | skill vs persistence | verdict |
|---|---|---|---|---|---|
| +1 h | 11.3 | persistence | 12.6 | 10.1 % | beats all baselines |
| +3 h | 18.7 | persistence | 23.4 | 20.1 % | beats all baselines |
| +6 h | 22.0 | ridge | 28.3 | 27.0 % | beats all baselines |
| +12 h | 24.3 | ridge | 27.2 | 31.7 % | beats all baselines |
| +24 h | 25.2 | ridge | 27.4 | 9.5 % | beats all baselines |

## +1 h

rows: train 61576, calibration 18211, test 46484; CQR widening 0.028 (log units); best iterations {'0.1': 409, '0.5': 411, '0.9': 872}; single-row predict 0.55 ms on this machine.

### all (n=46484)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 46484 | 12.6 | 30.5 | -0.2 | 0.0 % |
| climatology | 46484 | 32.9 | 52.3 | -1.4 | -161.6 % |
| cams | 46484 | 47.4 | 70.6 | 17.8 | -276.5 % |
| ridge | 46484 | 25.2 | 337.9 | -6.0 | -100.1 % |
| xgboost | 46484 | 11.7 | 27.5 | -3.2 | 7.4 % |
| lightgbm_q50 | 46484 | 11.3 | 27.1 | -1.7 | 10.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 74.3 % | 28.9 | 2.48 | 5.66 | 3.68 |
| lightgbm_cqr | 79.7 % | 32.5 | 2.48 | 5.66 | 3.61 |
| persistence_band | 72.6 % | 31.5 | 3.29 | 6.29 | 4.31 |

### winter (Nov-Feb) (n=6320)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 6320 | 16.8 | 37.0 | -0.4 | 0.0 % |
| climatology | 6320 | 39.4 | 62.5 | -4.5 | -134.4 % |
| cams | 6320 | 44.4 | 68.9 | -25.4 | -163.6 % |
| ridge | 6320 | 46.9 | 855.1 | 1.5 | -178.9 % |
| xgboost | 6320 | 14.8 | 33.6 | -2.4 | 12.2 % |
| lightgbm_q50 | 6320 | 14.6 | 33.6 | -1.4 | 13.3 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 76.9 % | 37.0 | 3.22 | 7.30 | 4.82 |
| lightgbm_cqr | 82.9 % | 42.7 | 3.23 | 7.30 | 4.77 |
| persistence_band | 81.2 % | 49.4 | 4.01 | 8.41 | 5.78 |

### other months (n=40164)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 40164 | 11.9 | 29.3 | -0.2 | 0.0 % |
| climatology | 40164 | 31.9 | 50.5 | -0.9 | -167.6 % |
| cams | 40164 | 47.9 | 70.9 | 24.6 | -301.6 % |
| ridge | 40164 | 21.8 | 130.9 | -7.2 | -82.6 % |
| xgboost | 40164 | 11.2 | 26.4 | -3.3 | 6.3 % |
| lightgbm_q50 | 40164 | 10.8 | 25.9 | -1.7 | 9.4 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 73.9 % | 27.7 | 2.37 | 5.40 | 3.50 |
| lightgbm_cqr | 79.2 % | 30.9 | 2.36 | 5.40 | 3.43 |
| persistence_band | 71.2 % | 28.7 | 3.18 | 5.96 | 4.08 |

### origin PM2.5 >= 100 (n=7751)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7751 | 30.1 | 60.4 | 8.0 | 0.0 % |
| climatology | 7751 | 68.6 | 100.6 | -62.5 | -127.6 % |
| cams | 7751 | 66.9 | 96.4 | -54.2 | -122.1 % |
| ridge | 7751 | 77.2 | 825.8 | 5.2 | -156.4 % |
| xgboost | 7751 | 26.6 | 52.4 | -7.2 | 11.6 % |
| lightgbm_q50 | 7751 | 25.4 | 51.4 | -2.0 | 15.7 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.5 % | 61.2 | 5.98 | 12.70 | 7.93 |
| lightgbm_cqr | 78.3 % | 69.2 | 5.95 | 12.70 | 7.73 |
| persistence_band | 76.1 % | 74.0 | 9.36 | 15.07 | 9.06 |

## +3 h

rows: train 59016, calibration 17163, test 43520; CQR widening 0.072 (log units); best iterations {'0.1': 223, '0.5': 413, '0.9': 334}; single-row predict 0.38 ms on this machine.

### all (n=43520)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 43520 | 23.4 | 48.4 | -0.5 | 0.0 % |
| climatology | 43520 | 33.0 | 53.0 | -1.1 | -41.0 % |
| cams | 43520 | 47.3 | 71.0 | 17.7 | -101.8 % |
| ridge | 43520 | 25.6 | 62.2 | -12.7 | -9.4 % |
| xgboost | 43520 | 19.0 | 39.0 | -6.5 | 19.1 % |
| lightgbm_q50 | 43520 | 18.7 | 38.6 | -4.9 | 20.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 73.8 % | 46.7 | 3.64 | 9.36 | 6.56 |
| lightgbm_cqr | 81.0 % | 55.9 | 3.64 | 9.36 | 6.37 |
| persistence_band | 75.5 % | 69.0 | 5.00 | 11.72 | 8.51 |

### winter (Nov-Feb) (n=5899)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5899 | 34.7 | 63.2 | -0.5 | 0.0 % |
| climatology | 5899 | 39.5 | 62.9 | -3.5 | -13.9 % |
| cams | 5899 | 44.4 | 69.5 | -24.8 | -28.0 % |
| ridge | 5899 | 40.4 | 103.6 | -16.2 | -16.6 % |
| xgboost | 5899 | 25.8 | 48.8 | -4.7 | 25.5 % |
| lightgbm_q50 | 5899 | 25.6 | 49.2 | -4.0 | 26.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 74.2 % | 63.3 | 4.98 | 12.81 | 9.07 |
| lightgbm_cqr | 82.2 % | 78.3 | 4.91 | 12.81 | 8.96 |
| persistence_band | 78.4 % | 108.3 | 6.70 | 17.34 | 12.51 |

### other months (n=37621)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 37621 | 21.7 | 45.7 | -0.5 | 0.0 % |
| climatology | 37621 | 32.0 | 51.3 | -0.7 | -47.8 % |
| cams | 37621 | 47.7 | 71.3 | 24.4 | -120.3 % |
| ridge | 37621 | 23.3 | 52.8 | -12.1 | -7.6 % |
| xgboost | 37621 | 17.9 | 37.2 | -6.8 | 17.5 % |
| lightgbm_q50 | 37621 | 17.6 | 36.7 | -5.1 | 18.6 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 73.7 % | 44.0 | 3.43 | 8.82 | 6.16 |
| lightgbm_cqr | 80.8 % | 52.4 | 3.44 | 8.82 | 5.96 |
| persistence_band | 75.0 % | 62.8 | 4.73 | 10.84 | 7.88 |

### origin PM2.5 >= 100 (n=7196)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7196 | 53.6 | 88.9 | 25.6 | 0.0 % |
| climatology | 7196 | 58.6 | 88.6 | -46.4 | -9.3 % |
| cams | 7196 | 58.5 | 85.9 | -40.8 | -9.2 % |
| ridge | 7196 | 57.1 | 129.1 | -18.7 | -6.5 % |
| xgboost | 7196 | 37.3 | 63.4 | -12.1 | 30.4 % |
| lightgbm_q50 | 7196 | 36.4 | 61.8 | -8.3 | 32.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.1 % | 88.0 | 7.32 | 18.19 | 12.37 |
| lightgbm_cqr | 79.1 % | 105.8 | 7.32 | 18.19 | 11.80 |
| persistence_band | 73.6 % | 162.4 | 13.51 | 26.79 | 16.64 |

## +6 h

rows: train 57456, calibration 16968, test 42632; CQR widening 0.110 (log units); best iterations {'0.1': 162, '0.5': 432, '0.9': 317}; single-row predict 0.63 ms on this machine.

### all (n=42632)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 42632 | 30.1 | 54.9 | 1.1 | 0.0 % |
| climatology | 42632 | 32.7 | 51.7 | -1.1 | -8.4 % |
| cams | 42632 | 46.9 | 70.1 | 17.7 | -55.9 % |
| ridge | 42632 | 28.3 | 240.7 | -13.4 | 6.1 % |
| xgboost | 42632 | 22.3 | 41.5 | -9.1 | 26.0 % |
| lightgbm_q50 | 42632 | 22.0 | 40.8 | -7.3 | 27.0 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 72.6 % | 53.3 | 4.10 | 11.00 | 7.52 |
| lightgbm_cqr | 81.7 % | 67.4 | 4.11 | 11.00 | 7.20 |
| persistence_band | 75.7 % | 95.8 | 5.64 | 15.06 | 10.84 |

### winter (Nov-Feb) (n=5757)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5757 | 46.8 | 74.6 | 2.9 | 0.0 % |
| climatology | 5757 | 39.5 | 62.6 | -4.2 | 15.5 % |
| cams | 5757 | 44.9 | 69.5 | -26.5 | 4.1 % |
| ridge | 5757 | 53.6 | 645.2 | -12.0 | -14.7 % |
| xgboost | 5757 | 30.9 | 53.6 | -9.5 | 34.0 % |
| lightgbm_q50 | 5757 | 30.4 | 52.6 | -7.0 | 35.0 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.3 % | 71.3 | 5.65 | 15.19 | 10.57 |
| lightgbm_cqr | 82.3 % | 93.7 | 5.66 | 15.19 | 10.08 |
| persistence_band | 77.2 % | 153.6 | 7.93 | 23.38 | 16.77 |

### other months (n=36875)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 36875 | 27.5 | 51.1 | 0.8 | 0.0 % |
| climatology | 36875 | 31.6 | 49.8 | -0.6 | -14.8 % |
| cams | 36875 | 47.3 | 70.2 | 24.6 | -71.8 % |
| ridge | 36875 | 24.3 | 44.6 | -13.7 | 11.7 % |
| xgboost | 36875 | 20.9 | 39.3 | -9.1 | 23.9 % |
| lightgbm_q50 | 36875 | 20.7 | 38.7 | -7.4 | 24.8 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 72.8 % | 50.5 | 3.86 | 10.35 | 7.05 |
| lightgbm_cqr | 81.6 % | 63.3 | 3.86 | 10.35 | 6.75 |
| persistence_band | 75.5 % | 86.8 | 5.29 | 13.76 | 9.91 |

### origin PM2.5 >= 100 (n=7350)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7350 | 67.3 | 98.8 | 42.8 | 0.0 % |
| climatology | 7350 | 51.9 | 79.8 | -35.2 | 22.9 % |
| cams | 7350 | 54.7 | 80.9 | -28.8 | 18.8 % |
| ridge | 7350 | 58.6 | 573.4 | -13.1 | 13.0 % |
| xgboost | 7350 | 39.1 | 63.6 | -16.9 | 42.0 % |
| lightgbm_q50 | 7350 | 38.2 | 62.0 | -14.2 | 43.3 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 68.4 % | 85.9 | 7.09 | 19.09 | 12.99 |
| lightgbm_cqr | 79.3 % | 109.7 | 7.06 | 19.09 | 12.14 |
| persistence_band | 69.7 % | 224.0 | 13.80 | 33.67 | 21.15 |

## +12 h

rows: train 55595, calibration 16753, test 41608; CQR widening 0.144 (log units); best iterations {'0.1': 124, '0.5': 235, '0.9': 377}; single-row predict 0.35 ms on this machine.

### all (n=41608)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 41608 | 35.6 | 59.8 | -0.1 | 0.0 % |
| climatology | 41608 | 32.9 | 52.6 | -1.1 | 7.3 % |
| cams | 41608 | 47.7 | 71.2 | 18.7 | -34.1 % |
| ridge | 41608 | 27.2 | 67.5 | -13.9 | 23.6 % |
| xgboost | 41608 | 24.4 | 44.2 | -10.5 | 31.3 % |
| lightgbm_q50 | 41608 | 24.3 | 44.0 | -8.2 | 31.7 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 70.9 % | 55.9 | 4.44 | 12.15 | 8.43 |
| lightgbm_cqr | 81.6 % | 74.1 | 4.44 | 12.15 | 7.88 |
| persistence_band | 74.4 % | 115.6 | 5.95 | 17.78 | 12.81 |

### winter (Nov-Feb) (n=5581)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5581 | 54.1 | 79.9 | 2.0 | 0.0 % |
| climatology | 5581 | 39.7 | 62.1 | -2.4 | 26.6 % |
| cams | 5581 | 44.0 | 68.3 | -24.1 | 18.7 % |
| ridge | 5581 | 42.9 | 145.8 | -21.5 | 20.7 % |
| xgboost | 5581 | 33.5 | 55.3 | -12.1 | 38.1 % |
| lightgbm_q50 | 5581 | 32.9 | 54.9 | -10.0 | 39.2 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 68.5 % | 72.0 | 6.20 | 16.44 | 11.38 |
| lightgbm_cqr | 82.1 % | 100.6 | 6.14 | 16.44 | 10.38 |
| persistence_band | 76.7 % | 185.3 | 8.40 | 27.05 | 18.64 |

### other months (n=36027)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 36027 | 32.7 | 56.0 | -0.4 | 0.0 % |
| climatology | 36027 | 31.9 | 51.0 | -0.9 | 2.4 % |
| cams | 36027 | 48.3 | 71.7 | 25.3 | -47.7 % |
| ridge | 36027 | 24.7 | 44.3 | -12.7 | 24.4 % |
| xgboost | 36027 | 23.0 | 42.2 | -10.3 | 29.5 % |
| lightgbm_q50 | 36027 | 23.0 | 42.0 | -8.0 | 29.7 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.3 % | 53.4 | 4.17 | 11.48 | 7.97 |
| lightgbm_cqr | 81.6 % | 70.0 | 4.17 | 11.48 | 7.50 |
| persistence_band | 74.1 % | 104.8 | 5.57 | 16.34 | 11.90 |

### origin PM2.5 >= 100 (n=6944)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 6944 | 78.4 | 108.3 | 52.5 | 0.0 % |
| climatology | 6944 | 49.3 | 81.0 | -27.8 | 37.2 % |
| cams | 6944 | 56.9 | 87.2 | -16.5 | 27.4 % |
| ridge | 6944 | 45.4 | 138.7 | -17.8 | 42.1 % |
| xgboost | 6944 | 39.1 | 68.9 | -17.4 | 50.1 % |
| lightgbm_q50 | 6944 | 39.2 | 69.0 | -16.4 | 50.0 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 67.5 % | 76.8 | 6.87 | 19.60 | 14.78 |
| lightgbm_cqr | 79.7 % | 104.4 | 6.80 | 19.60 | 13.48 |
| persistence_band | 64.6 % | 273.7 | 13.65 | 39.22 | 26.08 |

## +24 h

rows: train 55479, calibration 17619, test 42955; CQR widening 0.102 (log units); best iterations {'0.1': 74, '0.5': 146, '0.9': 240}; single-row predict 0.34 ms on this machine.

### all (n=42955)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 42955 | 27.9 | 51.4 | 0.0 | 0.0 % |
| climatology | 42955 | 33.0 | 52.6 | -1.5 | -18.3 % |
| cams | 42955 | 47.3 | 70.4 | 18.1 | -69.7 % |
| ridge | 42955 | 27.4 | 63.0 | -15.1 | 1.5 % |
| xgboost | 42955 | 25.2 | 45.6 | -11.7 | 9.5 % |
| lightgbm_q50 | 42955 | 25.2 | 45.6 | -9.0 | 9.5 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 74.3 % | 61.0 | 4.55 | 12.61 | 8.48 |
| lightgbm_cqr | 81.1 % | 73.7 | 4.58 | 12.61 | 8.11 |
| persistence_band | 76.7 % | 95.5 | 5.48 | 13.93 | 10.19 |

### winter (Nov-Feb) (n=5647)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5647 | 38.5 | 67.5 | 1.7 | 0.0 % |
| climatology | 5647 | 40.1 | 61.9 | -3.9 | -4.3 % |
| cams | 5647 | 44.5 | 67.9 | -24.8 | -15.7 % |
| ridge | 5647 | 41.9 | 129.3 | -21.9 | -9.1 % |
| xgboost | 5647 | 34.7 | 57.4 | -16.2 | 9.7 % |
| lightgbm_q50 | 5647 | 35.0 | 58.2 | -14.1 | 8.9 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 75.4 % | 83.8 | 6.23 | 17.52 | 12.00 |
| lightgbm_cqr | 82.7 % | 103.7 | 6.37 | 17.52 | 11.26 |
| persistence_band | 84.6 % | 153.2 | 8.03 | 19.23 | 13.69 |

### other months (n=37308)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 37308 | 26.3 | 48.5 | -0.2 | 0.0 % |
| climatology | 37308 | 31.9 | 51.0 | -1.2 | -21.4 % |
| cams | 37308 | 47.7 | 70.7 | 24.6 | -81.6 % |
| ridge | 37308 | 25.2 | 45.2 | -14.0 | 3.9 % |
| xgboost | 37308 | 23.8 | 43.5 | -11.0 | 9.4 % |
| lightgbm_q50 | 37308 | 23.7 | 43.3 | -8.2 | 9.6 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 74.1 % | 57.6 | 4.30 | 11.87 | 7.95 |
| lightgbm_cqr | 80.9 % | 69.2 | 4.31 | 11.87 | 7.64 |
| persistence_band | 75.5 % | 86.7 | 5.09 | 13.13 | 9.67 |

### origin PM2.5 >= 100 (n=7188)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7188 | 62.5 | 96.5 | 33.7 | 0.0 % |
| climatology | 7188 | 58.8 | 89.9 | -38.6 | 5.9 % |
| cams | 7188 | 61.2 | 90.8 | -30.5 | 2.1 % |
| ridge | 7188 | 55.4 | 129.9 | -29.0 | 11.4 % |
| xgboost | 7188 | 50.4 | 79.1 | -27.5 | 19.3 % |
| lightgbm_q50 | 7188 | 50.9 | 79.7 | -24.9 | 18.5 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 69.0 % | 104.4 | 8.69 | 25.47 | 17.61 |
| lightgbm_cqr | 76.4 % | 126.5 | 8.75 | 25.47 | 16.20 |
| persistence_band | 73.4 % | 226.2 | 13.48 | 31.26 | 20.64 |

## Caveats

- Weather is ERA5 reanalysis at the forecast origin only; no future weather is used, so these are not weather-forecast-assisted numbers.
- `cams` is the CAMS PM2.5 analysis/forecast at the target hour and exists only from Aug 2022; its row count is smaller.
- The 2023 to Jan 2025 CPCB gap on OpenAQ means training mixes a 2018-2022 feed and a 2025+ feed; sensor and reporting changes between them are not modelled.
- Stations are pooled; the test window is one year of one region. Skill elsewhere or in other years is unproven.

