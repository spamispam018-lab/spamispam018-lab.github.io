/**
 * Lokaler Fallback-Datenbestand für den Offline-Betrieb (file://)
 * Enthält ein breites Universum aus DAX 40, EuroStoxx 50 und relevanten US-Titeln (S&P 500 / Nasdaq).
 * Bereitgestellt über das globale window-Objekt (window.STOCK_DATA).
 * Enthält historische Verläufe für 1W, 1M, 6M und 1J.
 */
(function() {
  'use strict';

  window.STOCK_DATA = {
    lastUpdated: "2026-10-28T08:00:00Z",
    currency: "EUR",
    stocks: [
      // --- DAX 40 / Deutschland ---
      {
        ticker: "SAP.DE",
        name: "SAP SE",
        sector: "Technologie",
        country: "Deutschland",
        price: 218.40,
        changePercent: 1.45,
        marketCap: 255400000000,
        peRatio: 38.2,
        dividendYield: 1.05,
        perf52w: 58.4,
        currency: "EUR",
        history: [185.2, 189.4, 192.1, 198.5, 204.0, 201.3, 209.8, 215.1, 212.0, 218.4],
        ranges: {
          "1W": [215.0, 216.2, 215.8, 217.1, 218.4],
          "1M": [208.5, 210.0, 212.4, 214.0, 218.4],
          "6M": [178.0, 186.5, 194.0, 202.5, 218.4],
          "1J": [185.2, 189.4, 192.1, 198.5, 204.0, 201.3, 209.8, 215.1, 212.0, 218.4]
        }
      },
      {
        ticker: "SIE.DE",
        name: "Siemens AG",
        sector: "Industrie",
        country: "Deutschland",
        price: 182.60,
        changePercent: -0.65,
        marketCap: 146100000000,
        peRatio: 16.8,
        dividendYield: 2.85,
        perf52w: 32.1,
        currency: "EUR",
        history: [155.0, 158.2, 163.5, 170.0, 168.4, 174.2, 178.0, 184.5, 183.8, 182.6],
        ranges: {
          "1W": [184.2, 183.5, 184.0, 183.0, 182.6],
          "1M": [176.5, 178.0, 180.2, 183.5, 182.6],
          "6M": [164.0, 168.5, 172.0, 179.0, 182.6],
          "1J": [155.0, 158.2, 163.5, 170.0, 168.4, 174.2, 178.0, 184.5, 183.8, 182.6]
        }
      },
      {
        ticker: "ALV.DE",
        name: "Allianz SE",
        sector: "Finanzen",
        country: "Deutschland",
        price: 298.50,
        changePercent: 0.84,
        marketCap: 116800000000,
        peRatio: 11.4,
        dividendYield: 4.80,
        perf52w: 34.6,
        currency: "EUR",
        history: [250.0, 256.0, 262.5, 268.0, 275.4, 282.0, 289.0, 292.5, 296.0, 298.5],
        ranges: {
          "1W": [294.0, 295.2, 296.0, 297.1, 298.5],
          "1M": [286.0, 289.4, 291.5, 295.0, 298.5],
          "6M": [268.0, 274.0, 282.5, 290.0, 298.5],
          "1J": [250.0, 256.0, 262.5, 268.0, 275.4, 282.0, 289.0, 292.5, 296.0, 298.5]
        }
      },
      {
        ticker: "DTE.DE",
        name: "Deutsche Telekom AG",
        sector: "Kommunikation",
        country: "Deutschland",
        price: 26.80,
        changePercent: 0.38,
        marketCap: 133200000000,
        peRatio: 15.2,
        dividendYield: 3.35,
        perf52w: 28.5,
        currency: "EUR",
        history: [22.1, 22.8, 23.4, 24.0, 24.5, 25.1, 25.8, 26.2, 26.7, 26.8],
        ranges: {
          "1W": [26.4, 26.5, 26.6, 26.7, 26.8],
          "1M": [25.7, 25.9, 26.2, 26.5, 26.8],
          "6M": [23.8, 24.5, 25.0, 25.9, 26.8],
          "1J": [22.1, 22.8, 23.4, 24.0, 24.5, 25.1, 25.8, 26.2, 26.7, 26.8]
        }
      },
      {
        ticker: "AIR.DE",
        name: "Airbus SE",
        sector: "Industrie",
        country: "Europa",
        price: 142.10,
        changePercent: -1.18,
        marketCap: 112000000000,
        peRatio: 26.5,
        dividendYield: 1.35,
        perf52w: 12.4,
        currency: "EUR",
        history: [134.0, 138.2, 145.0, 152.0, 148.5, 139.0, 141.2, 144.8, 143.8, 142.1],
        ranges: {
          "1W": [144.5, 144.0, 143.5, 143.0, 142.1],
          "1M": [138.5, 140.2, 142.8, 144.5, 142.1],
          "6M": [156.0, 152.0, 146.0, 140.5, 142.1],
          "1J": [134.0, 138.2, 145.0, 152.0, 148.5, 139.0, 141.2, 144.8, 143.8, 142.1]
        }
      },
      {
        ticker: "MBG.DE",
        name: "Mercedes-Benz Group",
        sector: "Zyklischer Konsum",
        country: "Deutschland",
        price: 57.30,
        changePercent: -1.72,
        marketCap: 59800000000,
        peRatio: 5.6,
        dividendYield: 8.85,
        perf52w: -11.4,
        currency: "EUR",
        history: [68.0, 65.4, 63.8, 62.0, 59.5, 60.8, 58.2, 59.1, 58.3, 57.3],
        ranges: {
          "1W": [58.8, 58.4, 58.1, 57.9, 57.3],
          "1M": [60.2, 59.5, 58.8, 58.0, 57.3],
          "6M": [65.4, 63.0, 61.2, 59.0, 57.3],
          "1J": [68.0, 65.4, 63.8, 62.0, 59.5, 60.8, 58.2, 59.1, 58.3, 57.3]
        }
      },
      {
        ticker: "BMW.DE",
        name: "Bayerische Motoren Werke AG",
        sector: "Zyklischer Konsum",
        country: "Deutschland",
        price: 76.40,
        changePercent: -0.91,
        marketCap: 48200000000,
        peRatio: 5.8,
        dividendYield: 7.60,
        perf52w: -18.2,
        currency: "EUR",
        history: [98.0, 94.5, 89.0, 84.5, 82.0, 80.4, 78.5, 77.8, 77.1, 76.4],
        ranges: {
          "1W": [77.5, 77.2, 76.8, 76.9, 76.4],
          "1M": [79.2, 78.4, 77.5, 77.0, 76.4],
          "6M": [88.0, 85.0, 81.5, 78.0, 76.4],
          "1J": [98.0, 94.5, 89.0, 84.5, 82.0, 80.4, 78.5, 77.8, 77.1, 76.4]
        }
      },
      {
        ticker: "BAS.DE",
        name: "BASF SE",
        sector: "Grundstoffe",
        country: "Deutschland",
        price: 45.10,
        changePercent: 0.45,
        marketCap: 40200000000,
        peRatio: 14.1,
        dividendYield: 7.45,
        perf52w: 4.8,
        currency: "EUR",
        history: [44.0, 46.2, 49.5, 52.0, 48.3, 46.5, 44.8, 45.9, 44.9, 45.1],
        ranges: {
          "1W": [44.6, 44.8, 45.0, 44.9, 45.1],
          "1M": [43.8, 44.2, 45.0, 44.7, 45.1],
          "6M": [49.2, 47.5, 45.8, 44.3, 45.1],
          "1J": [44.0, 46.2, 49.5, 52.0, 48.3, 46.5, 44.8, 45.9, 44.9, 45.1]
        }
      },
      {
        ticker: "BAYN.DE",
        name: "Bayer AG",
        sector: "Gesundheitswesen",
        country: "Deutschland",
        price: 25.80,
        changePercent: -2.27,
        marketCap: 25300000000,
        peRatio: 6.2,
        dividendYield: 0.45,
        perf52w: -35.2,
        currency: "EUR",
        history: [41.0, 36.5, 32.0, 28.5, 27.0, 29.4, 28.1, 27.2, 26.4, 25.8],
        ranges: {
          "1W": [26.8, 26.5, 26.3, 26.1, 25.8],
          "1M": [27.5, 27.0, 26.8, 26.2, 25.8],
          "6M": [30.5, 29.0, 27.8, 26.5, 25.8],
          "1J": [41.0, 36.5, 32.0, 28.5, 27.0, 29.4, 28.1, 27.2, 26.4, 25.8]
        }
      },
      {
        ticker: "MUV2.DE",
        name: "Münchener Rück AG",
        sector: "Finanzen",
        country: "Deutschland",
        price: 486.20,
        changePercent: 1.12,
        marketCap: 65400000000,
        peRatio: 11.8,
        dividendYield: 3.15,
        perf52w: 39.8,
        currency: "EUR",
        history: [385.0, 398.0, 415.0, 430.0, 448.0, 462.0, 470.0, 479.0, 480.8, 486.2],
        ranges: {
          "1W": [478.0, 480.5, 482.0, 484.0, 486.2],
          "1M": [465.0, 471.0, 476.5, 482.0, 486.2],
          "6M": [435.0, 448.0, 460.0, 475.0, 486.2],
          "1J": [385.0, 398.0, 415.0, 430.0, 448.0, 462.0, 470.0, 479.0, 480.8, 486.2]
        }
      },
      {
        ticker: "DHL.DE",
        name: "DHL Group",
        sector: "Industrie",
        country: "Deutschland",
        price: 36.90,
        changePercent: -0.54,
        marketCap: 44200000000,
        peRatio: 12.9,
        dividendYield: 4.85,
        perf52w: -8.5,
        currency: "EUR",
        history: [42.0, 41.5, 39.8, 38.6, 39.2, 38.0, 37.4, 38.1, 37.1, 36.9],
        ranges: {
          "1W": [37.3, 37.1, 37.0, 37.2, 36.9],
          "1M": [38.2, 37.8, 37.5, 37.0, 36.9],
          "6M": [39.5, 39.0, 38.2, 37.4, 36.9],
          "1J": [42.0, 41.5, 39.8, 38.6, 39.2, 38.0, 37.4, 38.1, 37.1, 36.9]
        }
      },
      {
        ticker: "IFX.DE",
        name: "Infineon Technologies AG",
        sector: "Technologie",
        country: "Deutschland",
        price: 31.40,
        changePercent: 2.15,
        marketCap: 40900000000,
        peRatio: 19.4,
        dividendYield: 1.10,
        perf52w: -4.2,
        currency: "EUR",
        history: [35.0, 36.8, 38.2, 34.0, 30.5, 33.2, 31.0, 29.8, 30.7, 31.4],
        ranges: {
          "1W": [30.2, 30.6, 30.5, 31.0, 31.4],
          "1M": [29.8, 30.2, 30.8, 31.1, 31.4],
          "6M": [35.2, 33.8, 31.0, 30.0, 31.4],
          "1J": [35.0, 36.8, 38.2, 34.0, 30.5, 33.2, 31.0, 29.8, 30.7, 31.4]
        }
      },
      {
        ticker: "DB1.DE",
        name: "Deutsche Börse AG",
        sector: "Finanzen",
        country: "Deutschland",
        price: 212.00,
        changePercent: 0.66,
        marketCap: 39800000000,
        peRatio: 21.0,
        dividendYield: 1.95,
        perf52w: 31.4,
        currency: "EUR",
        history: [175.0, 180.2, 184.0, 189.5, 195.0, 201.0, 205.5, 209.0, 210.6, 212.0],
        ranges: {
          "1W": [209.5, 210.2, 211.0, 211.4, 212.0],
          "1M": [204.0, 206.5, 208.2, 210.5, 212.0],
          "6M": [188.0, 194.5, 200.0, 207.0, 212.0],
          "1J": [175.0, 180.2, 184.0, 189.5, 195.0, 201.0, 205.5, 209.0, 210.6, 212.0]
        }
      },
      {
        ticker: "BEI.DE",
        name: "Beiersdorf AG",
        sector: "Defensiver Konsum",
        country: "Deutschland",
        price: 132.80,
        changePercent: -0.30,
        marketCap: 30100000000,
        peRatio: 28.5,
        dividendYield: 0.85,
        perf52w: 6.8,
        currency: "EUR",
        history: [128.0, 131.0, 134.5, 139.0, 142.0, 138.5, 136.0, 135.2, 133.2, 132.8],
        ranges: {
          "1W": [133.5, 133.2, 133.0, 132.9, 132.8],
          "1M": [135.0, 134.4, 133.8, 133.2, 132.8],
          "6M": [141.0, 138.5, 136.0, 134.2, 132.8],
          "1J": [128.0, 131.0, 134.5, 139.0, 142.0, 138.5, 136.0, 135.2, 133.2, 132.8]
        }
      },
      {
        ticker: "RWE.DE",
        name: "RWE AG",
        sector: "Versorger",
        country: "Deutschland",
        price: 31.80,
        changePercent: 1.27,
        marketCap: 23600000000,
        peRatio: 11.2,
        dividendYield: 3.30,
        perf52w: -19.4,
        currency: "EUR",
        history: [40.0, 38.5, 35.0, 33.2, 34.0, 32.5, 31.8, 32.4, 31.4, 31.8],
        ranges: {
          "1W": [31.2, 31.4, 31.3, 31.6, 31.8],
          "1M": [32.5, 32.2, 31.8, 31.5, 31.8],
          "6M": [34.5, 33.8, 32.5, 31.6, 31.8],
          "1J": [40.0, 38.5, 35.0, 33.2, 34.0, 32.5, 31.8, 32.4, 31.4, 31.8]
        }
      },
      {
        ticker: "HEI.DE",
        name: "Heidelberg Materials AG",
        sector: "Grundstoffe",
        country: "Deutschland",
        price: 104.20,
        changePercent: 1.85,
        marketCap: 19100000000,
        peRatio: 9.8,
        dividendYield: 2.90,
        perf52w: 48.2,
        currency: "EUR",
        history: [74.0, 78.5, 84.0, 89.2, 94.0, 97.5, 96.0, 101.5, 102.3, 104.2],
        ranges: {
          "1W": [101.8, 102.4, 103.0, 103.5, 104.2],
          "1M": [98.5, 100.2, 101.8, 103.0, 104.2],
          "6M": [89.0, 93.4, 97.0, 101.2, 104.2],
          "1J": [74.0, 78.5, 84.0, 89.2, 94.0, 97.5, 96.0, 101.5, 102.3, 104.2]
        }
      },
      {
        ticker: "VOW3.DE",
        name: "Volkswagen AG Vz.",
        sector: "Zyklischer Konsum",
        country: "Deutschland",
        price: 91.50,
        changePercent: -2.14,
        marketCap: 48500000000,
        peRatio: 3.8,
        dividendYield: 9.60,
        perf52w: -22.4,
        currency: "EUR",
        history: [122.0, 118.0, 112.5, 108.0, 102.0, 98.5, 95.0, 94.2, 93.5, 91.5],
        ranges: {
          "1W": [93.8, 93.2, 92.5, 92.0, 91.5],
          "1M": [96.0, 95.2, 94.0, 92.8, 91.5],
          "6M": [112.0, 106.0, 101.0, 95.0, 91.5],
          "1J": [122.0, 118.0, 112.5, 108.0, 102.0, 98.5, 95.0, 94.2, 93.5, 91.5]
        }
      },
      {
        ticker: "ENR.DE",
        name: "Siemens Energy AG",
        sector: "Industrie",
        country: "Deutschland",
        price: 39.80,
        changePercent: 3.92,
        marketCap: 31600000000,
        peRatio: 34.2,
        dividendYield: 0.00,
        perf52w: 245.0,
        currency: "EUR",
        history: [12.5, 14.8, 18.2, 22.0, 25.5, 29.8, 33.4, 36.8, 38.3, 39.8],
        ranges: {
          "1W": [37.8, 38.2, 38.5, 38.9, 39.8],
          "1M": [34.5, 35.8, 37.0, 38.4, 39.8],
          "6M": [22.4, 26.5, 31.0, 36.2, 39.8],
          "1J": [12.5, 14.8, 18.2, 22.0, 25.5, 29.8, 33.4, 36.8, 38.3, 39.8]
        }
      },
      {
        ticker: "EOAN.DE",
        name: "E.ON SE",
        sector: "Versorger",
        country: "Deutschland",
        price: 13.10,
        changePercent: 0.38,
        marketCap: 34200000000,
        peRatio: 12.4,
        dividendYield: 4.15,
        perf52w: 16.5,
        currency: "EUR",
        history: [11.5, 11.9, 12.3, 12.6, 12.4, 12.8, 13.0, 13.2, 13.05, 13.1],
        ranges: {
          "1W": [12.95, 13.0, 13.05, 13.08, 13.1],
          "1M": [13.2, 13.15, 13.05, 13.08, 13.1],
          "6M": [12.4, 12.7, 12.9, 13.15, 13.1],
          "1J": [11.5, 11.9, 12.3, 12.6, 12.4, 12.8, 13.0, 13.2, 13.05, 13.1]
        }
      },
      {
        ticker: "HNR1.DE",
        name: "Hannover Rück SE",
        sector: "Finanzen",
        country: "Deutschland",
        price: 246.50,
        changePercent: 0.41,
        marketCap: 29700000000,
        peRatio: 12.8,
        dividendYield: 3.10,
        perf52w: 24.8,
        currency: "EUR",
        history: [205.0, 212.0, 219.0, 226.0, 234.0, 239.0, 242.0, 244.5, 245.5, 246.5],
        ranges: {
          "1W": [244.0, 244.8, 245.5, 246.0, 246.5],
          "1M": [239.0, 241.5, 243.0, 245.2, 246.5],
          "6M": [228.0, 234.0, 238.5, 243.0, 246.5],
          "1J": [205.0, 212.0, 219.0, 226.0, 234.0, 239.0, 242.0, 244.5, 245.5, 246.5]
        }
      },

      // --- Europa ---
      {
        ticker: "ASML.AS",
        name: "ASML Holding NV",
        sector: "Technologie",
        country: "Niederlande",
        price: 668.00,
        changePercent: -1.48,
        marketCap: 263000000000,
        peRatio: 37.5,
        dividendYield: 0.95,
        perf52w: 15.6,
        currency: "EUR",
        history: [620.0, 680.0, 750.0, 890.0, 960.0, 840.0, 780.0, 710.0, 678.0, 668.0],
        ranges: {
          "1W": [680.0, 676.0, 672.0, 670.0, 668.0],
          "1M": [715.0, 702.0, 690.0, 675.0, 668.0],
          "6M": [880.0, 940.0, 850.0, 740.0, 668.0],
          "1J": [620.0, 680.0, 750.0, 890.0, 960.0, 840.0, 780.0, 710.0, 678.0, 668.0]
        }
      },
      {
        ticker: "MC.PA",
        name: "LVMH Moët Hennessy",
        sector: "Zyklischer Konsum",
        country: "Frankreich",
        price: 614.00,
        changePercent: -1.13,
        marketCap: 307000000000,
        peRatio: 20.2,
        dividendYield: 2.15,
        perf52w: -18.4,
        currency: "EUR",
        history: [790.0, 820.0, 840.0, 780.0, 740.0, 690.0, 650.0, 635.0, 621.0, 614.0],
        ranges: {
          "1W": [628.0, 624.0, 620.0, 618.0, 614.0],
          "1M": [650.0, 642.0, 631.0, 620.0, 614.0],
          "6M": [750.0, 720.0, 680.0, 640.0, 614.0],
          "1J": [790.0, 820.0, 840.0, 780.0, 740.0, 690.0, 650.0, 635.0, 621.0, 614.0]
        }
      },
      {
        ticker: "OR.PA",
        name: "L'Oréal SA",
        sector: "Defensiver Konsum",
        country: "Frankreich",
        price: 362.40,
        changePercent: 0.39,
        marketCap: 194000000000,
        peRatio: 29.8,
        dividendYield: 1.80,
        perf52w: -11.2,
        currency: "EUR",
        history: [420.0, 435.0, 440.0, 410.0, 395.0, 380.0, 372.0, 365.0, 361.0, 362.4],
        ranges: {
          "1W": [360.0, 361.2, 361.8, 362.0, 362.4],
          "1M": [368.0, 365.0, 363.0, 361.5, 362.4],
          "6M": [410.0, 395.0, 382.0, 368.0, 362.4],
          "1J": [420.0, 435.0, 440.0, 410.0, 395.0, 380.0, 372.0, 365.0, 361.0, 362.4]
        }
      },
      {
        ticker: "TTE.PA",
        name: "TotalEnergies SE",
        sector: "Energie",
        country: "Frankreich",
        price: 59.80,
        changePercent: 0.67,
        marketCap: 141000000000,
        peRatio: 7.4,
        dividendYield: 5.35,
        perf52w: -2.8,
        currency: "EUR",
        history: [62.0, 64.5, 68.0, 66.5, 64.0, 62.2, 60.5, 59.8, 59.4, 59.8],
        ranges: {
          "1W": [59.2, 59.5, 59.3, 59.6, 59.8],
          "1M": [61.0, 60.5, 60.0, 59.4, 59.8],
          "6M": [67.0, 65.0, 63.2, 60.8, 59.8],
          "1J": [62.0, 64.5, 68.0, 66.5, 64.0, 62.2, 60.5, 59.8, 59.4, 59.8]
        }
      },
      {
        ticker: "SAN.PA",
        name: "Sanofi SA",
        sector: "Gesundheitswesen",
        country: "Frankreich",
        price: 88.50,
        changePercent: -0.23,
        marketCap: 111000000000,
        peRatio: 18.9,
        dividendYield: 4.25,
        perf52w: 6.2,
        currency: "EUR",
        history: [84.0, 86.5, 88.0, 90.5, 87.2, 89.0, 92.0, 90.1, 88.7, 88.5],
        ranges: {
          "1W": [89.0, 88.8, 88.6, 88.7, 88.5],
          "1M": [90.5, 89.8, 89.2, 88.6, 88.5],
          "6M": [86.5, 88.0, 91.5, 90.0, 88.5],
          "1J": [84.0, 86.5, 88.0, 90.5, 87.2, 89.0, 92.0, 90.1, 88.7, 88.5]
        }
      },
      {
        ticker: "NESN.SW",
        name: "Nestlé S.A.",
        sector: "Defensiver Konsum",
        country: "Schweiz",
        price: 88.20,
        changePercent: -0.45,
        marketCap: 232000000000,
        peRatio: 19.5,
        dividendYield: 3.45,
        perf52w: -15.8,
        currency: "EUR",
        history: [108.0, 104.0, 99.5, 96.0, 94.2, 92.0, 90.5, 89.8, 88.6, 88.2],
        ranges: {
          "1W": [88.9, 88.6, 88.4, 88.5, 88.2],
          "1M": [90.2, 89.6, 89.0, 88.5, 88.2],
          "6M": [95.5, 93.8, 91.4, 89.5, 88.2],
          "1J": [108.0, 104.0, 99.5, 96.0, 94.2, 92.0, 90.5, 89.8, 88.6, 88.2]
        }
      },
      {
        ticker: "NOVN.SW",
        name: "Novartis AG",
        sector: "Gesundheitswesen",
        country: "Schweiz",
        price: 99.40,
        changePercent: 0.51,
        marketCap: 201000000000,
        peRatio: 15.6,
        dividendYield: 3.30,
        perf52w: 18.2,
        currency: "EUR",
        history: [86.0, 88.5, 91.0, 93.5, 96.0, 98.2, 101.0, 98.5, 98.9, 99.4],
        ranges: {
          "1W": [98.2, 98.6, 99.0, 99.2, 99.4],
          "1M": [97.5, 98.0, 98.8, 99.1, 99.4],
          "6M": [92.0, 95.0, 98.0, 100.5, 99.4],
          "1J": [86.0, 88.5, 91.0, 93.5, 96.0, 98.2, 101.0, 98.5, 98.9, 99.4]
        }
      },
      {
        ticker: "ROG.SW",
        name: "Roche Holding AG",
        sector: "Gesundheitswesen",
        country: "Schweiz",
        price: 274.00,
        changePercent: 0.88,
        marketCap: 221000000000,
        peRatio: 16.2,
        dividendYield: 3.55,
        perf52w: 12.5,
        currency: "EUR",
        history: [248.0, 242.0, 235.0, 240.0, 252.0, 265.0, 271.0, 268.0, 271.6, 274.0],
        ranges: {
          "1W": [270.5, 271.8, 272.5, 273.2, 274.0],
          "1M": [267.0, 269.5, 271.0, 272.8, 274.0],
          "6M": [242.0, 252.0, 264.0, 270.0, 274.0],
          "1J": [248.0, 242.0, 235.0, 240.0, 252.0, 265.0, 271.0, 268.0, 271.6, 274.0]
        }
      },
      {
        ticker: "NOVO-B.CO",
        name: "Novo Nordisk A/S",
        sector: "Gesundheitswesen",
        country: "Dänemark",
        price: 112.50,
        changePercent: -0.80,
        marketCap: 504000000000,
        peRatio: 36.8,
        dividendYield: 1.15,
        perf52w: 42.1,
        currency: "EUR",
        history: [85.0, 92.0, 99.5, 114.0, 128.0, 122.0, 118.0, 115.0, 113.4, 112.5],
        ranges: {
          "1W": [114.2, 113.8, 113.5, 113.0, 112.5],
          "1M": [116.0, 115.2, 114.0, 113.2, 112.5],
          "6M": [126.0, 124.0, 119.5, 115.0, 112.5],
          "1J": [85.0, 92.0, 99.5, 114.0, 128.0, 122.0, 118.0, 115.0, 113.4, 112.5]
        }
      },
      {
        ticker: "IBE.MC",
        name: "Iberdrola S.A.",
        sector: "Versorger",
        country: "Spanien",
        price: 13.85,
        changePercent: 0.36,
        marketCap: 88500000000,
        peRatio: 15.4,
        dividendYield: 4.10,
        perf52w: 27.4,
        currency: "EUR",
        history: [11.2, 11.5, 11.9, 12.2, 12.5, 12.9, 13.4, 13.7, 13.8, 13.85],
        ranges: {
          "1W": [13.75, 13.78, 13.82, 13.84, 13.85],
          "1M": [13.55, 13.62, 13.70, 13.80, 13.85],
          "6M": [12.2, 12.6, 13.1, 13.6, 13.85],
          "1J": [11.2, 11.5, 11.9, 12.2, 12.5, 12.9, 13.4, 13.7, 13.8, 13.85]
        }
      },

      // --- USA ---
      {
        ticker: "AAPL",
        name: "Apple Inc.",
        sector: "Technologie",
        country: "USA",
        price: 215.20,
        changePercent: 0.72,
        marketCap: 3280000000000,
        peRatio: 33.8,
        dividendYield: 0.45,
        perf52w: 36.5,
        currency: "EUR",
        history: [168.0, 175.0, 182.0, 172.0, 195.0, 210.0, 224.0, 218.0, 213.7, 215.2],
        ranges: {
          "1W": [212.5, 213.8, 214.2, 214.6, 215.2],
          "1M": [218.0, 216.5, 214.0, 214.8, 215.2],
          "6M": [182.0, 195.0, 212.0, 222.0, 215.2],
          "1J": [168.0, 175.0, 182.0, 172.0, 195.0, 210.0, 224.0, 218.0, 213.7, 215.2]
        }
      },
      {
        ticker: "MSFT",
        name: "Microsoft Corp.",
        sector: "Technologie",
        country: "USA",
        price: 398.50,
        changePercent: 1.25,
        marketCap: 2960000000000,
        peRatio: 34.5,
        dividendYield: 0.75,
        perf52w: 28.2,
        currency: "EUR",
        history: [330.0, 355.0, 380.0, 415.0, 435.0, 420.0, 405.0, 412.0, 393.6, 398.5],
        ranges: {
          "1W": [392.0, 394.5, 395.0, 396.8, 398.5],
          "1M": [408.0, 404.0, 400.5, 396.0, 398.5],
          "6M": [418.0, 432.0, 422.0, 406.0, 398.5],
          "1J": [330.0, 355.0, 380.0, 415.0, 435.0, 420.0, 405.0, 412.0, 393.6, 398.5]
        }
      },
      {
        ticker: "NVDA",
        name: "NVIDIA Corp.",
        sector: "Technologie",
        country: "USA",
        price: 129.40,
        changePercent: 3.40,
        marketCap: 3170000000000,
        peRatio: 52.4,
        dividendYield: 0.08,
        perf52w: 195.0,
        currency: "EUR",
        history: [48.0, 62.0, 85.0, 92.0, 120.0, 115.0, 105.0, 118.0, 125.1, 129.4],
        ranges: {
          "1W": [122.5, 124.0, 126.2, 127.8, 129.4],
          "1M": [116.0, 119.5, 122.8, 126.0, 129.4],
          "6M": [88.0, 108.0, 122.0, 114.0, 129.4],
          "1J": [48.0, 62.0, 85.0, 92.0, 120.0, 115.0, 105.0, 118.0, 125.1, 129.4]
        }
      },
      {
        ticker: "GOOGL",
        name: "Alphabet Inc. (Class A)",
        sector: "Kommunikation",
        country: "USA",
        price: 154.20,
        changePercent: -0.65,
        marketCap: 1910000000000,
        peRatio: 22.8,
        dividendYield: 0.48,
        perf52w: 31.8,
        currency: "EUR",
        history: [125.0, 132.0, 145.0, 160.0, 175.0, 162.0, 150.0, 158.0, 155.2, 154.2],
        ranges: {
          "1W": [156.0, 155.4, 155.0, 154.8, 154.2],
          "1M": [152.0, 154.0, 156.2, 155.0, 154.2],
          "6M": [168.0, 176.0, 164.0, 156.0, 154.2],
          "1J": [125.0, 132.0, 145.0, 160.0, 175.0, 162.0, 150.0, 158.0, 155.2, 154.2]
        }
      },
      {
        ticker: "AMZN",
        name: "Amazon.com Inc.",
        sector: "Zyklischer Konsum",
        country: "USA",
        price: 173.80,
        changePercent: 1.10,
        marketCap: 1810000000000,
        peRatio: 41.2,
        dividendYield: 0.00,
        perf52w: 42.6,
        currency: "EUR",
        history: [128.0, 142.0, 155.0, 172.0, 185.0, 178.0, 165.0, 171.0, 171.9, 173.8],
        ranges: {
          "1W": [170.5, 171.4, 172.0, 172.8, 173.8],
          "1M": [168.0, 170.2, 171.5, 172.4, 173.8],
          "6M": [178.0, 186.0, 174.0, 168.0, 173.8],
          "1J": [128.0, 142.0, 155.0, 172.0, 185.0, 178.0, 165.0, 171.0, 171.9, 173.8]
        }
      },
      {
        ticker: "META",
        name: "Meta Platforms Inc.",
        sector: "Kommunikation",
        country: "USA",
        price: 540.20,
        changePercent: 1.80,
        marketCap: 1370000000000,
        peRatio: 27.6,
        dividendYield: 0.35,
        perf52w: 92.4,
        currency: "EUR",
        history: [305.0, 360.0, 460.0, 490.0, 475.0, 505.0, 515.0, 532.0, 530.6, 540.2],
        ranges: {
          "1W": [528.0, 531.0, 534.5, 537.0, 540.2],
          "1M": [510.0, 518.0, 526.0, 535.0, 540.2],
          "6M": [470.0, 495.0, 510.0, 525.0, 540.2],
          "1J": [305.0, 360.0, 460.0, 490.0, 475.0, 505.0, 515.0, 532.0, 530.6, 540.2]
        }
      },
      {
        ticker: "TSLA",
        name: "Tesla Inc.",
        sector: "Zyklischer Konsum",
        country: "USA",
        price: 202.50,
        changePercent: -2.85,
        marketCap: 645000000000,
        peRatio: 64.0,
        dividendYield: 0.00,
        perf52w: -1.5,
        currency: "EUR",
        history: [240.0, 220.0, 185.0, 160.0, 175.0, 220.0, 195.0, 210.0, 208.4, 202.5],
        ranges: {
          "1W": [212.0, 210.5, 208.0, 205.5, 202.5],
          "1M": [225.0, 218.0, 212.0, 206.0, 202.5],
          "6M": [175.0, 215.0, 228.0, 212.0, 202.5],
          "1J": [240.0, 220.0, 185.0, 160.0, 175.0, 220.0, 195.0, 210.0, 208.4, 202.5]
        }
      },
      {
        ticker: "BRK-B",
        name: "Berkshire Hathaway B",
        sector: "Finanzen",
        country: "USA",
        price: 415.80,
        changePercent: 0.22,
        marketCap: 915000000000,
        peRatio: 19.8,
        dividendYield: 0.00,
        perf52w: 28.6,
        currency: "EUR",
        history: [335.0, 350.0, 368.0, 395.0, 405.0, 412.0, 425.0, 420.0, 414.9, 415.8],
        ranges: {
          "1W": [414.0, 414.5, 415.0, 415.2, 415.8],
          "1M": [422.0, 419.0, 417.5, 416.0, 415.8],
          "6M": [398.0, 406.0, 418.0, 424.0, 415.8],
          "1J": [335.0, 350.0, 368.0, 395.0, 405.0, 412.0, 425.0, 420.0, 414.9, 415.8]
        }
      },
      {
        ticker: "JNJ",
        name: "Johnson & Johnson",
        sector: "Gesundheitswesen",
        country: "USA",
        price: 151.20,
        changePercent: -0.15,
        marketCap: 364000000000,
        peRatio: 16.4,
        dividendYield: 3.25,
        perf52w: 2.1,
        currency: "EUR",
        history: [146.0, 152.0, 155.0, 149.0, 144.0, 150.0, 158.0, 154.0, 151.4, 151.2],
        ranges: {
          "1W": [152.0, 151.8, 151.5, 151.3, 151.2],
          "1M": [155.0, 153.8, 152.5, 151.6, 151.2],
          "6M": [146.0, 148.5, 154.0, 156.0, 151.2],
          "1J": [146.0, 152.0, 155.0, 149.0, 144.0, 150.0, 158.0, 154.0, 151.4, 151.2]
        }
      },
      {
        ticker: "V",
        name: "Visa Inc.",
        sector: "Finanzen",
        country: "USA",
        price: 261.40,
        changePercent: 0.55,
        marketCap: 524000000000,
        peRatio: 29.1,
        dividendYield: 0.78,
        perf52w: 22.8,
        currency: "EUR",
        history: [225.0, 238.0, 255.0, 268.0, 262.0, 258.0, 265.0, 264.0, 260.0, 261.4],
        ranges: {
          "1W": [259.0, 260.2, 260.8, 261.0, 261.4],
          "1M": [263.0, 261.5, 260.0, 260.8, 261.4],
          "6M": [262.0, 265.0, 259.0, 263.0, 261.4],
          "1J": [225.0, 238.0, 255.0, 268.0, 262.0, 258.0, 265.0, 264.0, 260.0, 261.4]
        }
      },
      {
        ticker: "JPM",
        name: "JPMorgan Chase & Co.",
        sector: "Finanzen",
        country: "USA",
        price: 204.60,
        changePercent: 0.90,
        marketCap: 582000000000,
        peRatio: 12.2,
        dividendYield: 2.25,
        perf52w: 48.0,
        currency: "EUR",
        history: [145.0, 158.0, 172.0, 188.0, 195.0, 192.0, 205.0, 208.0, 202.8, 204.6],
        ranges: {
          "1W": [201.5, 202.4, 203.2, 203.9, 204.6],
          "1M": [206.0, 204.0, 202.5, 203.5, 204.6],
          "6M": [190.0, 196.0, 204.0, 207.0, 204.6],
          "1J": [145.0, 158.0, 172.0, 188.0, 195.0, 192.0, 205.0, 208.0, 202.8, 204.6]
        }
      },
      {
        ticker: "PG",
        name: "Procter & Gamble Co.",
        sector: "Defensiver Konsum",
        country: "USA",
        price: 155.80,
        changePercent: -0.40,
        marketCap: 366000000000,
        peRatio: 25.4,
        dividendYield: 2.45,
        perf52w: 14.8,
        currency: "EUR",
        history: [142.0, 146.0, 150.0, 154.0, 158.0, 162.0, 168.0, 161.0, 156.4, 155.8],
        ranges: {
          "1W": [156.8, 156.4, 156.0, 156.1, 155.8],
          "1M": [162.0, 160.0, 158.5, 156.8, 155.8],
          "6M": [154.0, 158.0, 164.0, 166.0, 155.8],
          "1J": [142.0, 146.0, 150.0, 154.0, 158.0, 162.0, 168.0, 161.0, 156.4, 155.8]
        }
      },
      {
        ticker: "KO",
        name: "The Coca-Cola Co.",
        sector: "Defensiver Konsum",
        country: "USA",
        price: 61.20,
        changePercent: 0.16,
        marketCap: 263000000000,
        peRatio: 24.8,
        dividendYield: 3.10,
        perf52w: 21.4,
        currency: "EUR",
        history: [52.0, 55.0, 57.5, 59.0, 61.0, 63.5, 68.0, 64.0, 61.1, 61.2],
        ranges: {
          "1W": [60.8, 61.0, 60.9, 61.1, 61.2],
          "1M": [64.0, 63.2, 62.4, 61.5, 61.2],
          "6M": [59.0, 61.5, 64.0, 66.8, 61.2],
          "1J": [52.0, 55.0, 57.5, 59.0, 61.0, 63.5, 68.0, 64.0, 61.1, 61.2]
        }
      },
      {
        ticker: "PEP",
        name: "PepsiCo Inc.",
        sector: "Defensiver Konsum",
        country: "USA",
        price: 159.40,
        changePercent: -0.35,
        marketCap: 219000000000,
        peRatio: 23.2,
        dividendYield: 3.35,
        perf52w: 5.6,
        currency: "EUR",
        history: [158.0, 162.0, 168.0, 174.0, 170.0, 166.0, 172.0, 164.0, 160.0, 159.4],
        ranges: {
          "1W": [160.5, 160.2, 159.8, 159.6, 159.4],
          "1M": [164.0, 162.8, 161.2, 160.0, 159.4],
          "6M": [168.0, 171.0, 167.0, 163.0, 159.4],
          "1J": [158.0, 162.0, 168.0, 174.0, 170.0, 166.0, 172.0, 164.0, 160.0, 159.4]
        }
      },
      {
        ticker: "WMT",
        name: "Walmart Inc.",
        sector: "Defensiver Konsum",
        country: "USA",
        price: 74.50,
        changePercent: 1.05,
        marketCap: 598000000000,
        peRatio: 31.8,
        dividendYield: 1.10,
        perf52w: 52.0,
        currency: "EUR",
        history: [51.0, 54.0, 58.5, 62.0, 65.5, 67.0, 72.0, 75.0, 73.7, 74.5],
        ranges: {
          "1W": [73.2, 73.6, 74.0, 74.2, 74.5],
          "1M": [72.5, 73.0, 74.2, 74.0, 74.5],
          "6M": [63.0, 66.0, 68.5, 72.5, 74.5],
          "1J": [51.0, 54.0, 58.5, 62.0, 65.5, 67.0, 72.0, 75.0, 73.7, 74.5]
        }
      },
      {
        ticker: "COST",
        name: "Costco Wholesale Corp.",
        sector: "Defensiver Konsum",
        country: "USA",
        price: 820.00,
        changePercent: 0.74,
        marketCap: 364000000000,
        peRatio: 51.2,
        dividendYield: 0.55,
        perf52w: 62.8,
        currency: "EUR",
        history: [540.0, 590.0, 660.0, 715.0, 780.0, 830.0, 850.0, 840.0, 814.0, 820.0],
        ranges: {
          "1W": [810.0, 814.0, 816.0, 818.0, 820.0],
          "1M": [835.0, 828.0, 822.0, 816.0, 820.0],
          "6M": [730.0, 775.0, 825.0, 845.0, 820.0],
          "1J": [540.0, 590.0, 660.0, 715.0, 780.0, 830.0, 850.0, 840.0, 814.0, 820.0]
        }
      },
      {
        ticker: "MCD",
        name: "McDonald's Corp.",
        sector: "Zyklischer Konsum",
        country: "USA",
        price: 271.80,
        changePercent: -0.60,
        marketCap: 195000000000,
        peRatio: 23.5,
        dividendYield: 2.50,
        perf52w: 12.2,
        currency: "EUR",
        history: [255.0, 268.0, 278.0, 262.0, 248.0, 252.0, 285.0, 280.0, 273.4, 271.8],
        ranges: {
          "1W": [274.0, 273.2, 272.5, 272.8, 271.8],
          "1M": [282.0, 278.5, 276.0, 273.0, 271.8],
          "6M": [258.0, 250.0, 265.0, 282.0, 271.8],
          "1J": [255.0, 268.0, 278.0, 262.0, 248.0, 252.0, 285.0, 280.0, 273.4, 271.8]
        }
      },
      {
        ticker: "XOM",
        name: "Exxon Mobil Corp.",
        sector: "Energie",
        country: "USA",
        price: 112.40,
        changePercent: 0.45,
        marketCap: 442000000000,
        peRatio: 13.5,
        dividendYield: 3.40,
        perf52w: 16.2,
        currency: "EUR",
        history: [102.0, 98.0, 105.0, 116.0, 112.0, 110.0, 118.0, 115.0, 111.9, 112.4],
        ranges: {
          "1W": [111.5, 112.0, 111.8, 112.1, 112.4],
          "1M": [115.5, 114.2, 113.0, 112.0, 112.4],
          "6M": [114.0, 112.0, 115.0, 117.5, 112.4],
          "1J": [102.0, 98.0, 105.0, 116.0, 112.0, 110.0, 118.0, 115.0, 111.9, 112.4]
        }
      },
      {
        ticker: "CVX",
        name: "Chevron Corp.",
        sector: "Energie",
        country: "USA",
        price: 140.80,
        changePercent: 0.15,
        marketCap: 258000000000,
        peRatio: 14.2,
        dividendYield: 4.60,
        perf52w: -2.4,
        currency: "EUR",
        history: [148.0, 142.0, 149.0, 156.0, 152.0, 144.0, 142.0, 143.5, 140.6, 140.8],
        ranges: {
          "1W": [140.0, 140.4, 140.2, 140.5, 140.8],
          "1M": [144.0, 142.5, 141.8, 140.5, 140.8],
          "6M": [154.0, 148.0, 144.0, 142.5, 140.8],
          "1J": [148.0, 142.0, 149.0, 156.0, 152.0, 144.0, 142.0, 143.5, 140.6, 140.8]
        }
      },
      {
        ticker: "AMD",
        name: "Advanced Micro Devices",
        sector: "Technologie",
        country: "USA",
        price: 142.50,
        changePercent: 2.80,
        marketCap: 231000000000,
        peRatio: 44.0,
        dividendYield: 0.00,
        perf52w: 54.2,
        currency: "EUR",
        history: [98.0, 118.0, 155.0, 195.0, 160.0, 145.0, 135.0, 148.0, 138.6, 142.5],
        ranges: {
          "1W": [137.0, 138.5, 140.0, 141.2, 142.5],
          "1M": [148.0, 144.0, 141.0, 139.5, 142.5],
          "6M": [155.0, 164.0, 146.0, 138.0, 142.5],
          "1J": [98.0, 118.0, 155.0, 195.0, 160.0, 145.0, 135.0, 148.0, 138.6, 142.5]
        }
      }
    ]
  };
})();
