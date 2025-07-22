// src/types/index.ts

export interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
  openInterest?: number; // <--- ADD THIS LINE
  rsi?: number;          // <--- ADD THIS LINE
  // Add other properties if you expand SymbolData further (e.g., marketCap, liquidationVolume)
}

export interface SymbolTradeSignal {
  symbol: string;
  signal: "long" | "short" | null;
  strength: "Weak" | "Medium" | "Strong";
  confidence: "Low Confidence" | "Medium Confidence" | "High Confidence";
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}

// You might also need to update MarketAnalysis types if they are defined here
// (They are defined in MarketAnalysisDisplay.tsx, which is fine, but if you centralize them, do it here)
