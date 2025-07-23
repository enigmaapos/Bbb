// src/types/index.ts

export interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
  openInterest?: number;
  rsi?: number;
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

// --- NEW/UPDATED: Liquidation Data Interfaces ---
export interface LiquidationEvent {
  symbol: string;
  side: "BUY" | "SELL"; // BUY for short liquidations, SELL for long liquidations
  price: number;
  quantity: number;
  timestamp: number; // Unix timestamp
}

export interface AggregatedLiquidationData {
  totalLongLiquidationsUSD: number;
  totalShortLiquidationsUSD: number;
  longLiquidationCount: number;
  shortLiquidationCount: number;
  // You can add more complex aggregates if needed, e.g.,
  // mostRecentLiquidatedPriceLevel?: number;
}
// --- END NEW/UPDATED ---


// --- MOVED & UPDATED: Interfaces for Sentiment Analysis ---
export interface SymbolAnalysisData {
  symbol: string;
  volume: number;
  priceChange: number;
  fundingRate: number;
  marketCap?: number;
  rsi?: number;
  openInterest?: number; // USD value of OI
  // Add any other raw data points needed for analysis for a single symbol
}

export interface MarketStats {
  green: number;
  red: number;
  fundingStats: {
    greenFundingPositive: number;
    // --- FIX APPLIED HERE ---
    greenNegativeFunding: number; // Changed from greenFundingNegative to match component
    // -------------------------
    redPositiveFunding: number;
    redNegativeFunding: number;
  };
  volumeData: SymbolAnalysisData[]; // Individual symbol data for volume, RSI, etc.
  liquidationData?: AggregatedLiquidationData; // NEW: Aggregated liquidation data
}

export interface SentimentResult {
  rating: string;
  interpretation: string;
  score: number;
}

export interface MarketAnalysisResults {
  generalBias: SentimentResult;
  fundingImbalance: SentimentResult;
  shortSqueezeCandidates: SentimentResult; // Renamed for consistency
  longTrapCandidates: SentimentResult;     // Renamed for consistency
  volumeSentiment: SentimentResult;
  speculativeInterest: SentimentResult;
  liquidationHeatmap: SentimentResult;    // NEW: Placeholder updated in sentimentAnalyzer
  momentumImbalance: SentimentResult;     // NEW
  overallSentimentAccuracy: string;
  overallMarketOutlook: {
    score: number;
    tone: string;
    strategySuggestion: string;
  };
}
// --- END MOVED & UPDATED ---
