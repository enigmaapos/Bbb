// src/types.ts (or just types.ts)

export type SymbolData = {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
};

export type SymbolTradeSignal = {
  symbol: string;
  signal: "long" | "short" | null;
  strength: "Weak" | "Medium" | "Strong"; // Added strength
  confidence: "Low Confidence" | "Medium Confidence" | "High Confidence"; // Added confidence
};
