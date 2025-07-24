// src/types/index.ts

// --- Data Structures ---
export interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
  sentimentSignal?: SentimentSignal; // ADDED: To store the detected signal
}

export interface FundingStats {
  greenPositiveFunding: number;
  greenNegativeFunding: number;
  redPositiveFunding: number;
  redNegativeFunding: number;
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

export interface LiquidationEvent {
  symbol: string;
  side: "BUY" | "SELL"; // BUY for short liquidation, SELL for long liquidation
  price: number;
  quantity: number;
  timestamp: number;
}

export interface AggregatedLiquidationData {
  totalLongLiquidationsUSD: number;
  totalShortLiquidationsUSD: number;
  longLiquidationCount: number;
  shortLiquidationCount: number;
}

// --- Sentiment Analysis Structures ---

export interface SentimentRating {
  rating: string;
  interpretation: string;
  score: number;
}

export interface OverallMarketOutlook {
  score: number;
  tone: string;
  strategySuggestion: string;
}

export interface MarketStats {
  green: number;
  red: number;
  fundingStats: FundingStats;
  volumeData: Array<{
    symbol: string;
    volume: number;
    priceChange: number;
    fundingRate: number;
  }>;
  liquidationData?: AggregatedLiquidationData; // Optional, as it might be loading
}

export interface MarketAnalysisResults {
  generalBias: SentimentRating;
  fundingImbalance: SentimentRating;
  shortSqueezeCandidates: SentimentRating;
  longTrapCandidates: SentimentRating;
  volumeSentiment: SentimentRating;
  liquidationHeatmap: SentimentRating;
  overallSentimentAccuracy: string;
  overallMarketOutlook: OverallMarketOutlook;
}

// NEW TYPE ADDED (already existed, but confirming its place):
export type SentimentSignal = {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Neutral';
  reason: string;
};
