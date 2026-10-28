// data/fallback-data.js - Lokale Fallback-Daten

const FALLBACK_STOCKS = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 228.50,
    change: 1.25,
    pe: 31.4,
    dividendYield: 0.52,
    marketCap: 3500000000000,
    sector: "Technology"
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    price: 425.10,
    change: -0.45,
    pe: 34.2,
    dividendYield: 0.75,
    marketCap: 3150000000000,
    sector: "Technology"
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    price: 135.80,
    change: 3.80,
    pe: 58.6,
    dividendYield: 0.08,
    marketCap: 3300000000000,
    sector: "Technology"
  },
  {
    symbol: "SAP",
    name: "SAP SE",
    price: 212.40,
    change: 0.85,
    pe: 28.1,
    dividendYield: 1.15,
    marketCap: 250000000000,
    sector: "Technology"
  },
  {
    symbol: "ALV",
    name: "Allianz SE",
    price: 295.60,
    change: 0.40,
    pe: 11.2,
    dividendYield: 4.85,
    marketCap: 115000000000,
    sector: "Financial Services"
  },
  {
    symbol: "BMW",
    name: "Bayerische Motoren Werke AG",
    price: 84.50,
    change: -1.10,
    pe: 5.8,
    dividendYield: 7.10,
    marketCap: 52000000000,
    sector: "Consumer Cyclical"
  },
  {
    symbol: "JNJ",
    name: "Johnson & Johnson",
    price: 161.20,
    change: 0.15,
    pe: 16.5,
    dividendYield: 3.05,
    marketCap: 388000000000,
    sector: "Healthcare"
  },
  {
    symbol: "KO",
    name: "The Coca-Cola Company",
    price: 68.30,
    change: 0.65,
    pe: 25.4,
    dividendYield: 2.85,
    marketCap: 294000000000,
    sector: "Consumer Defensive"
  }
];

const FALLBACK_DETAILS = {
  AAPL: {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 228.50,
    change: 1.25,
    pe: 31.4,
    marketCap: 3500000000000,
    dividendYield: 0.52,
    sector: "Technology",
    description: "Apple Inc. entwickelt, produziert und vertreibt Smartphones, PCs, Tablets, Wearables und Zubehör sowie damit verbundene Dienstleistungen weltweit."
  },
  MSFT: {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    price: 425.10,
    change: -0.45,
    pe: 34.2,
    marketCap: 3150000000000,
    dividendYield: 0.75,
    sector: "Technology",
    description: "Microsoft entwickelt Software, Hardware, Services und Cloud-Lösungen für Unternehmen und Privatanwender weltweit."
  },
  ALV: {
    symbol: "ALV",
    name: "Allianz SE",
    price: 295.60,
    change: 0.40,
    pe: 11.2,
    marketCap: 115000000000,
    dividendYield: 4.85,
    sector: "Financial Services",
    description: "Die Allianz SE ist eines der weltweit führenden Versicherungs- und Asset-Management-Unternehmen mit Sitz in München."
  }
};

window.FALLBACK_STOCKS = FALLBACK_STOCKS;
window.FALLBACK_DETAILS = FALLBACK_DETAILS;
