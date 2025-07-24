// types/index.ts

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
  strength: "Strong" | "Medium" | "Weak";
  confidence: "High Confidence" | "Medium Confidence" | "Low Confidence";
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
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
  volumeData: { symbol: string; volume: number; priceChange: number; fundingRate: number }[];
  liquidationData?: AggregatedLiquidationData; // Optional, as it might not always be available
  flaggedSignals: SentimentSignal[];
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

export interface MarketAnalysisResults {
  generalBias: SentimentRating;
  fundingImbalance: SentimentRating;
  shortSqueezeCandidates: SentimentRating;
  longTrapCandidates: SentimentRating;
  volumeSentiment: SentimentRating;
  liquidationHeatmap: SentimentRating;
  highQualityBreakout: SentimentRating;
  flaggedSignalSentiment: SentimentRating;
  overallSentimentAccuracy: string;
  overallMarketOutlook: {
    score: number;
    tone: string;
    strategySuggestion: string;
  };
}

export interface SentimentSignal {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Neutral';
  reason: string;
}

export interface FundingImbalanceData {
  priceUpShortsPaying: number;
  priceUpLongsPaying: number;
  priceDownLongsPaying: number;
  priceDownShortsPaying: number;
  topShortSqueeze: SymbolData[];
  topLongTrap: SymbolData[];
}
