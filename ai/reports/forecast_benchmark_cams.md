# PM2.5 forecast benchmark

_Generated 2026-10-31 16:43 UTC on Windows AMD64, Python 3.12.10; feature set `cams`; stations: Najafgarh, Delhi - DPCC, Vikas Sadan, Gurugram - HSPCB, Sector-2 IMT, Manesar - HSPCB, Sector-51, Gurugram - HSPCB, NSIT Dwarka, Delhi - CPCB, Dwarka-Sector 8, Delhi - DPCC, Arya Nagar, Bahadurgarh - HSPCB, Aya Nagar, New Delhi - IMD, IGI Airport (T3), Delhi - IMD, NISE Gwal Pahari, Gurugram - IMD._

Forecasts of **CPCB station PM2.5** near Gurugram. They are not AEIOS node measurements, and no field-accuracy claim is made about the nodes. Windows: train targets until 2025-10-01; calibration origins 2025-10-01..2026-01-16; test origins from 2026-01-16.

## Summary

| horizon | LightGBM MAE | best baseline | baseline MAE | skill vs persistence | verdict |
|---|---|---|---|---|---|
| +1 h | 11.3 | persistence | 12.6 | 9.9 % | beats all baselines |
| +3 h | 18.9 | persistence | 23.4 | 19.6 % | beats all baselines |
| +6 h | 22.4 | ridge | 28.5 | 25.8 % | beats all baselines |
| +12 h | 24.5 | ridge | 27.1 | 31.1 % | beats all baselines |
| +24 h | 25.6 | ridge | 27.2 | 8.3 % | beats all baselines |

## +1 h

rows: train 61576, calibration 18211, test 46484; CQR widening 0.029 (log units); best iterations {'0.1': 302, '0.5': 756, '0.9': 663}; single-row predict 0.62 ms on this machine.

### all (n=46484)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 46484 | 12.6 | 30.5 | -0.2 | 0.0 % |
| climatology | 46484 | 32.9 | 52.3 | -1.4 | -161.6 % |
| cams | 46484 | 47.4 | 70.6 | 17.8 | -276.5 % |
| ridge | 46484 | 25.7 | 506.3 | -0.1 | -104.6 % |
| xgboost | 46484 | 11.7 | 27.6 | -3.6 | 6.8 % |
| lightgbm_q50 | 46484 | 11.3 | 27.1 | -1.9 | 9.9 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 73.2 % | 28.4 | 2.47 | 5.67 | 3.69 |
| lightgbm_cqr | 79.2 % | 32.2 | 2.47 | 5.67 | 3.61 |
| persistence_band | 72.6 % | 31.5 | 3.29 | 6.29 | 4.31 |

### winter (Nov-Feb) (n=6320)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 6320 | 16.8 | 37.0 | -0.4 | 0.0 % |
| climatology | 6320 | 39.4 | 62.5 | -4.5 | -134.4 % |
| cams | 6320 | 44.4 | 68.9 | -25.4 | -163.6 % |
| ridge | 6320 | 54.4 | 1329.5 | 26.9 | -223.1 % |
| xgboost | 6320 | 14.9 | 33.9 | -3.6 | 11.2 % |
| lightgbm_q50 | 6320 | 14.6 | 33.6 | -2.7 | 13.3 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 76.1 % | 36.6 | 3.19 | 7.30 | 4.81 |
| lightgbm_cqr | 83.1 % | 42.7 | 3.21 | 7.30 | 4.74 |
| persistence_band | 81.2 % | 49.4 | 4.01 | 8.41 | 5.78 |

### other months (n=40164)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 40164 | 11.9 | 29.3 | -0.2 | 0.0 % |
| climatology | 40164 | 31.9 | 50.5 | -0.9 | -167.6 % |
| cams | 40164 | 47.9 | 70.9 | 24.6 | -301.6 % |
| ridge | 40164 | 21.2 | 136.3 | -4.3 | -78.3 % |
| xgboost | 40164 | 11.2 | 26.5 | -3.5 | 5.8 % |
| lightgbm_q50 | 40164 | 10.8 | 25.9 | -1.8 | 9.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 72.8 % | 27.1 | 2.35 | 5.41 | 3.51 |
| lightgbm_cqr | 78.5 % | 30.5 | 2.35 | 5.41 | 3.43 |
| persistence_band | 71.2 % | 28.7 | 3.18 | 5.96 | 4.08 |

### origin PM2.5 >= 100 (n=7751)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7751 | 30.1 | 60.4 | 8.0 | 0.0 % |
| climatology | 7751 | 68.6 | 100.6 | -62.5 | -127.6 % |
| cams | 7751 | 66.9 | 96.4 | -54.2 | -122.1 % |
| ridge | 7751 | 83.8 | 1238.8 | 29.2 | -178.0 % |
| xgboost | 7751 | 27.2 | 52.6 | -9.0 | 9.9 % |
| lightgbm_q50 | 7751 | 25.4 | 51.4 | -3.6 | 15.6 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.4 % | 61.8 | 5.90 | 12.72 | 7.93 |
| lightgbm_cqr | 78.6 % | 70.3 | 5.89 | 12.72 | 7.69 |
| persistence_band | 76.1 % | 74.0 | 9.36 | 15.07 | 9.06 |

## +3 h

rows: train 59016, calibration 17163, test 43520; CQR widening 0.095 (log units); best iterations {'0.1': 209, '0.5': 426, '0.9': 423}; single-row predict 0.39 ms on this machine.

### all (n=43520)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 43520 | 23.4 | 48.4 | -0.5 | 0.0 % |
| climatology | 43520 | 33.0 | 53.0 | -1.1 | -41.0 % |
| cams | 43520 | 47.3 | 71.0 | 17.7 | -101.8 % |
| ridge | 43520 | 25.3 | 72.8 | -8.2 | -8.0 % |
| xgboost | 43520 | 19.0 | 39.2 | -7.5 | 18.8 % |
| lightgbm_q50 | 43520 | 18.9 | 38.9 | -6.0 | 19.6 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.9 % | 44.2 | 3.64 | 9.43 | 6.71 |
| lightgbm_cqr | 81.6 % | 56.2 | 3.66 | 9.43 | 6.36 |
| persistence_band | 75.5 % | 69.0 | 5.00 | 11.72 | 8.51 |

### winter (Nov-Feb) (n=5899)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5899 | 34.7 | 63.2 | -0.5 | 0.0 % |
| climatology | 5899 | 39.5 | 62.9 | -3.5 | -13.9 % |
| cams | 5899 | 44.4 | 69.5 | -24.8 | -28.0 % |
| ridge | 5899 | 41.8 | 146.1 | 1.2 | -20.4 % |
| xgboost | 5899 | 26.2 | 49.3 | -9.0 | 24.4 % |
| lightgbm_q50 | 5899 | 26.2 | 50.0 | -8.8 | 24.5 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 71.3 % | 58.0 | 4.97 | 13.09 | 9.32 |
| lightgbm_cqr | 82.8 % | 77.0 | 4.99 | 13.09 | 8.82 |
| persistence_band | 78.4 % | 108.3 | 6.70 | 17.34 | 12.51 |

### other months (n=37621)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 37621 | 21.7 | 45.7 | -0.5 | 0.0 % |
| climatology | 37621 | 32.0 | 51.3 | -0.7 | -47.8 % |
| cams | 37621 | 47.7 | 71.3 | 24.4 | -120.3 % |
| ridge | 37621 | 22.7 | 52.7 | -9.7 | -4.9 % |
| xgboost | 37621 | 17.9 | 37.4 | -7.2 | 17.4 % |
| lightgbm_q50 | 37621 | 17.7 | 36.8 | -5.5 | 18.3 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 72.0 % | 42.0 | 3.43 | 8.85 | 6.30 |
| lightgbm_cqr | 81.4 % | 52.9 | 3.46 | 8.85 | 5.98 |
| persistence_band | 75.0 % | 62.8 | 4.73 | 10.84 | 7.88 |

### origin PM2.5 >= 100 (n=7196)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7196 | 53.6 | 88.9 | 25.6 | 0.0 % |
| climatology | 7196 | 58.6 | 88.6 | -46.4 | -9.3 % |
| cams | 7196 | 58.5 | 85.9 | -40.8 | -9.2 % |
| ridge | 7196 | 57.9 | 160.0 | -3.3 | -8.0 % |
| xgboost | 7196 | 37.8 | 63.9 | -16.2 | 29.4 % |
| lightgbm_q50 | 7196 | 36.9 | 62.5 | -12.1 | 31.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 67.8 % | 82.5 | 7.31 | 18.46 | 12.82 |
| lightgbm_cqr | 78.8 % | 105.4 | 7.37 | 18.46 | 11.77 |
| persistence_band | 73.6 % | 162.4 | 13.51 | 26.79 | 16.64 |

## +6 h

rows: train 57456, calibration 16968, test 42632; CQR widening 0.112 (log units); best iterations {'0.1': 89, '0.5': 496, '0.9': 330}; single-row predict 3.71 ms on this machine.

### all (n=42632)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 42632 | 30.1 | 54.9 | 1.1 | 0.0 % |
| climatology | 42632 | 32.7 | 51.7 | -1.1 | -8.4 % |
| cams | 42632 | 46.9 | 70.1 | 17.7 | -55.9 % |
| ridge | 42632 | 28.5 | 315.9 | -10.4 | 5.5 % |
| xgboost | 42632 | 22.7 | 42.2 | -10.6 | 24.6 % |
| lightgbm_q50 | 42632 | 22.4 | 41.4 | -8.0 | 25.8 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 72.1 % | 53.0 | 4.13 | 11.18 | 7.79 |
| lightgbm_cqr | 81.3 % | 66.9 | 4.18 | 11.18 | 7.33 |
| persistence_band | 75.7 % | 95.8 | 5.64 | 15.06 | 10.84 |

### winter (Nov-Feb) (n=5757)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5757 | 46.8 | 74.6 | 2.9 | 0.0 % |
| climatology | 5757 | 39.5 | 62.6 | -4.2 | 15.5 % |
| cams | 5757 | 44.9 | 69.5 | -26.5 | 4.1 % |
| ridge | 5757 | 57.1 | 852.5 | 1.6 | -22.0 % |
| xgboost | 5757 | 32.0 | 55.3 | -15.3 | 31.7 % |
| lightgbm_q50 | 5757 | 30.7 | 53.6 | -10.5 | 34.3 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 70.7 % | 72.4 | 5.75 | 15.36 | 11.19 |
| lightgbm_cqr | 81.4 % | 94.2 | 5.87 | 15.36 | 10.39 |
| persistence_band | 77.2 % | 153.6 | 7.93 | 23.38 | 16.77 |

### other months (n=36875)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 36875 | 27.5 | 51.1 | 0.8 | 0.0 % |
| climatology | 36875 | 31.6 | 49.8 | -0.6 | -14.8 % |
| cams | 36875 | 47.3 | 70.2 | 24.6 | -71.8 % |
| ridge | 36875 | 24.0 | 44.2 | -12.3 | 12.8 % |
| xgboost | 36875 | 21.3 | 39.8 | -9.9 | 22.7 % |
| lightgbm_q50 | 36875 | 21.1 | 39.2 | -7.6 | 23.5 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 72.3 % | 50.0 | 3.87 | 10.53 | 7.26 |
| lightgbm_cqr | 81.3 % | 62.7 | 3.91 | 10.53 | 6.85 |
| persistence_band | 75.5 % | 86.8 | 5.29 | 13.76 | 9.91 |

### origin PM2.5 >= 100 (n=7350)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7350 | 67.3 | 98.8 | 42.8 | 0.0 % |
| climatology | 7350 | 51.9 | 79.8 | -35.2 | 22.9 % |
| cams | 7350 | 54.7 | 80.9 | -28.8 | 18.8 % |
| ridge | 7350 | 61.3 | 756.2 | -2.1 | 9.0 % |
| xgboost | 7350 | 40.2 | 65.2 | -20.7 | 40.2 % |
| lightgbm_q50 | 7350 | 39.3 | 63.6 | -17.7 | 41.7 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 67.4 % | 85.4 | 7.15 | 19.64 | 13.83 |
| lightgbm_cqr | 77.9 % | 108.5 | 7.25 | 19.64 | 12.60 |
| persistence_band | 69.7 % | 224.0 | 13.80 | 33.67 | 21.15 |

## +12 h

rows: train 55595, calibration 16753, test 41608; CQR widening 0.149 (log units); best iterations {'0.1': 99, '0.5': 182, '0.9': 323}; single-row predict 0.30 ms on this machine.

### all (n=41608)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 41608 | 35.6 | 59.8 | -0.1 | 0.0 % |
| climatology | 41608 | 32.9 | 52.6 | -1.1 | 7.3 % |
| cams | 41608 | 47.7 | 71.2 | 18.7 | -34.1 % |
| ridge | 41608 | 27.1 | 72.8 | -12.7 | 23.7 % |
| xgboost | 41608 | 24.9 | 45.1 | -12.3 | 30.0 % |
| lightgbm_q50 | 41608 | 24.5 | 44.6 | -10.3 | 31.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 69.6 % | 54.0 | 4.46 | 12.25 | 8.77 |
| lightgbm_cqr | 81.1 % | 72.4 | 4.49 | 12.25 | 7.98 |
| persistence_band | 74.4 % | 115.6 | 5.95 | 17.78 | 12.81 |

### winter (Nov-Feb) (n=5581)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5581 | 54.1 | 79.9 | 2.0 | 0.0 % |
| climatology | 5581 | 39.7 | 62.1 | -2.4 | 26.6 % |
| cams | 5581 | 44.0 | 68.3 | -24.1 | 18.7 % |
| ridge | 5581 | 43.1 | 164.3 | -17.5 | 20.4 % |
| xgboost | 5581 | 34.8 | 57.8 | -19.5 | 35.6 % |
| lightgbm_q50 | 5581 | 34.0 | 57.3 | -18.6 | 37.1 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 64.1 % | 65.4 | 6.11 | 17.00 | 12.71 |
| lightgbm_cqr | 79.8 % | 93.0 | 6.24 | 17.00 | 10.79 |
| persistence_band | 76.7 % | 185.3 | 8.40 | 27.05 | 18.64 |

### other months (n=36027)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 36027 | 32.7 | 56.0 | -0.4 | 0.0 % |
| climatology | 36027 | 31.9 | 51.0 | -0.9 | 2.4 % |
| cams | 36027 | 48.3 | 71.7 | 25.3 | -47.7 % |
| ridge | 36027 | 24.6 | 44.1 | -11.9 | 24.6 % |
| xgboost | 36027 | 23.4 | 42.8 | -11.2 | 28.5 % |
| lightgbm_q50 | 36027 | 23.0 | 42.3 | -9.0 | 29.5 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 70.5 % | 52.3 | 4.20 | 11.51 | 8.16 |
| lightgbm_cqr | 81.3 % | 69.2 | 4.22 | 11.51 | 7.54 |
| persistence_band | 74.1 % | 104.8 | 5.57 | 16.34 | 11.90 |

### origin PM2.5 >= 100 (n=6944)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 6944 | 78.4 | 108.3 | 52.5 | 0.0 % |
| climatology | 6944 | 49.3 | 81.0 | -27.8 | 37.2 % |
| cams | 6944 | 56.9 | 87.2 | -16.5 | 27.4 % |
| ridge | 6944 | 45.7 | 154.3 | -14.0 | 41.7 % |
| xgboost | 6944 | 40.2 | 70.8 | -23.0 | 48.8 % |
| lightgbm_q50 | 6944 | 39.7 | 70.4 | -22.5 | 49.4 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 66.8 % | 74.1 | 6.85 | 19.83 | 15.60 |
| lightgbm_cqr | 78.9 % | 101.3 | 6.94 | 19.83 | 13.86 |
| persistence_band | 64.6 % | 273.7 | 13.65 | 39.22 | 26.08 |

## +24 h

rows: train 55479, calibration 17619, test 42955; CQR widening 0.244 (log units); best iterations {'0.1': 49, '0.5': 163, '0.9': 449}; single-row predict 0.35 ms on this machine.

### all (n=42955)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 42955 | 27.9 | 51.4 | 0.0 | 0.0 % |
| climatology | 42955 | 33.0 | 52.6 | -1.5 | -18.3 % |
| cams | 42955 | 47.3 | 70.4 | 18.1 | -69.7 % |
| ridge | 42955 | 27.2 | 69.7 | -12.9 | 2.3 % |
| xgboost | 42955 | 25.6 | 46.1 | -12.8 | 7.9 % |
| lightgbm_q50 | 42955 | 25.6 | 46.1 | -11.2 | 8.3 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 69.7 % | 55.5 | 4.58 | 12.78 | 9.42 |
| lightgbm_cqr | 85.6 % | 84.8 | 4.78 | 12.78 | 8.27 |
| persistence_band | 76.7 % | 95.5 | 5.48 | 13.93 | 10.19 |

### winter (Nov-Feb) (n=5647)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 5647 | 38.5 | 67.5 | 1.7 | 0.0 % |
| climatology | 5647 | 40.1 | 61.9 | -3.9 | -4.3 % |
| cams | 5647 | 44.5 | 67.9 | -24.8 | -15.7 % |
| ridge | 5647 | 42.0 | 153.9 | -15.1 | -9.1 % |
| xgboost | 5647 | 35.7 | 58.7 | -20.5 | 7.2 % |
| lightgbm_q50 | 5647 | 36.0 | 60.0 | -21.5 | 6.4 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 64.4 % | 66.9 | 6.28 | 18.00 | 15.18 |
| lightgbm_cqr | 84.0 % | 109.1 | 6.92 | 18.00 | 11.60 |
| persistence_band | 84.6 % | 153.2 | 8.03 | 19.23 | 13.69 |

### other months (n=37308)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 37308 | 26.3 | 48.5 | -0.2 | 0.0 % |
| climatology | 37308 | 31.9 | 51.0 | -1.2 | -21.4 % |
| cams | 37308 | 47.7 | 70.7 | 24.6 | -81.6 % |
| ridge | 37308 | 25.0 | 44.9 | -12.6 | 4.8 % |
| xgboost | 37308 | 24.1 | 43.9 | -11.7 | 8.1 % |
| lightgbm_q50 | 37308 | 24.0 | 43.6 | -9.7 | 8.7 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 70.5 % | 53.8 | 4.32 | 11.99 | 8.55 |
| lightgbm_cqr | 85.8 % | 81.1 | 4.46 | 11.99 | 7.76 |
| persistence_band | 75.5 % | 86.7 | 5.09 | 13.13 | 9.67 |

### origin PM2.5 >= 100 (n=7188)

| method | n | MAE | RMSE | bias | skill vs persistence |
|---|---|---|---|---|---|
| persistence | 7188 | 62.5 | 96.5 | 33.7 | 0.0 % |
| climatology | 7188 | 58.8 | 89.9 | -38.6 | 5.9 % |
| cams | 7188 | 61.2 | 90.8 | -30.5 | 2.1 % |
| ridge | 7188 | 55.4 | 149.6 | -22.2 | 11.3 % |
| xgboost | 7188 | 51.6 | 80.3 | -31.4 | 17.5 % |
| lightgbm_q50 | 7188 | 51.5 | 80.7 | -31.8 | 17.6 % |

| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |
|---|---|---|---|---|---|
| lightgbm_raw | 62.1 % | 93.7 | 8.75 | 25.75 | 20.54 |
| lightgbm_cqr | 80.5 % | 142.7 | 9.16 | 25.75 | 16.20 |
| persistence_band | 73.4 % | 226.2 | 13.48 | 31.26 | 20.64 |

## Caveats

- Weather is ERA5 reanalysis at the forecast origin only; no future weather is used, so these are not weather-forecast-assisted numbers.
- `cams` is the CAMS PM2.5 analysis/forecast at the target hour and exists only from Aug 2022; its row count is smaller.
- The 2023 to Jan 2025 CPCB gap on OpenAQ means training mixes a 2018-2022 feed and a 2025+ feed; sensor and reporting changes between them are not modelled.
- Stations are pooled; the test window is one year of one region. Skill elsewhere or in other years is unproven.

