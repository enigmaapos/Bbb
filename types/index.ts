// src/types/index.ts

export interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
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
  side: "BUY" | "SELL";
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

export interface SentimentRating {
  rating: string;
  interpretation: string;
  score: number;
}

// NEW TYPE: For your checklist script
export type SentimentSignal = {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Neutral';
  reason: string;
};

// Updated MarketAnalysisResults interface
export interface MarketAnalysisResults {
  generalBias: SentimentRating;
  fundingImbalance: SentimentRating;
  shortSqueezeCandidates: SentimentRating;
  longTrapCandidates: SentimentRating;
  volumeSentiment: SentimentRating;
  liquidationHeatmap: SentimentRating;
  highQualityBreakout: SentimentRating;
  // NEW PROPERTY: To store the sentiment derived from the flagged signals
  flaggedSignalSentiment: SentimentRating;
  overallSentimentAccuracy: string;
  overallMarketOutlook: {
    score: number;
    tone: string;
    strategySuggestion: string;
  };
}

export interface MarketStats {
  green: number;
  red: number;
  fundingStats: {
    greenPositiveFunding: number;
    greenNegativeFunding: number;
    redPositiveFunding: number;
    redNegativeFunding: number;
  };
  volumeData: Array<{
    symbol: string;
    volume: number;
    priceChange: number;
    fundingRate: number;
  }>;
  liquidationData?: AggregatedLiquidationData;
  // NEW: Add flaggedSignals to MarketStats so sentimentAnalyzer can access it
  flaggedSignals: SentimentSignal[];
}
