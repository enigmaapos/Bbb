// src/types.ts

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
  strength: "Weak" | "Medium" | "Strong";
  confidence: "Low Confidence" | "Medium Confidence" | "High Confidence";
  // Re-introducing these fields for display purposes in the table
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
};
