// src/types.ts

// Define the data structure for a single cryptocurrency symbol
export interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  volume: number;
}

// Define the data structure for overall market stats
export interface MarketData {
  greenCount: number;
  redCount: number;
  greenPositiveFunding: number;
  greenNegativeFunding: number;
  redPositiveFunding: number;
  redNegativeFunding: number;
  priceUpFundingNegativeCount: number;
  priceDownFundingPositiveCount: number;
  topShortSqueeze: SymbolData[];
  topLongTrap: SymbolData[];
  totalLongLiquidationsUSD: number;
  totalShortLiquidationsUSD: number;
}

// Define the data structure for a single news article
export interface SentimentArticle {
  title: string;
  source: string;
  date: string;
}

// Define the data structure for aggregated liquidation data
export interface AggregatedLiquidationData {
  totalLongLiquidationsUSD: number;
  totalShortLiquidationsUSD: number;
}

// Define the data structure for Site A's specific market data
export interface SiteAData {
  longShortRatio: number;
  openInterestChange: number;
}

// Define the complete data structure for the market statistics input
export interface MarketStats {
  green: number;
  red: number;
  fundingStats: {
    greenPositiveFunding: number;
    greenNegativeFunding: number;
    redPositiveFunding: number;
    redNegativeFunding: number;
  };
  volumeData: SymbolData[];
  liquidationData: AggregatedLiquidationData | null;
  newsArticles: SentimentArticle[];
  siteAData: SiteAData | null; // ADDITION: The new Site A data
}

// Define the data structure for the output of the sentiment analysis
export interface AnalysisComponentResult {
  rating: string;
  interpretation: string;
  score: number;
}

// Define the data structure for actionable sentiment signals
export interface SentimentSignal {
  symbol: string;
  signal: "Bullish Opportunity" | "Bearish Risk";
  type: string;
  description: string;
}

export interface ActionableSentimentSummary {
  bullishCount: number;
  bearishCount: number;
  tone: "Bullish" | "Bearish" | "Neutral";
  interpretation: string;
  score: number;
}

// Define the complete data structure for the final analysis results
export interface MarketAnalysisResults {
  generalBias: AnalysisComponentResult;
  fundingImbalance: AnalysisComponentResult;
  shortSqueezeCandidates: AnalysisComponentResult;
  longTrapCandidates: AnalysisComponentResult;
  volumeSentiment: AnalysisComponentResult;
  liquidationHeatmap: AnalysisComponentResult;
  newsSentiment: AnalysisComponentResult;
  actionableSentimentSignals: SentimentSignal[];
  actionableSentimentSummary: ActionableSentimentSummary;
  overallSentimentAccuracy: string;
  overallMarketOutlook: {
    score: number;
    tone: string;
    strategySuggestion: string;
  };
  marketData: MarketData;
  newsData: SentimentArticle[];
  siteAData: SiteAData | null;
}
