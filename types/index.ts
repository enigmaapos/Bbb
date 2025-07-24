// src/types.ts

export interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
  sentimentSignal?: SentimentSignal; // Optional sentiment signal
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
  side: "BUY" | "SELL"; // BUY for short liquidations, SELL for long liquidations
  price: number;
  quantity: number;
  timestamp: number; // Unix timestamp in milliseconds
}

export interface AggregatedLiquidationData {
  totalLongLiquidationsUSD: number;
  totalShortLiquidationsUSD: number;
  longLiquidationCount: number;
  shortLiquidationCount: number;
}

export interface MarketAnalysisResultDetail {
  rating: string;
  interpretation: string;
  score: number; // Score from 0-10
}

// NEW: Interface for news articles used in sentiment analysis
export interface SentimentArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

// NEW: Interface for MarketData to be passed to MarketAnalysisDisplay
export interface MarketData {
  greenCount: number;
  redCount: number;
  greenPositiveFunding: number;
  greenNegativeFunding: number;
  redPositiveFunding: number;
  redNegativeFunding: number;
  priceUpFundingNegativeCount: number;
  priceDownFundingPositiveCount: number;
  topShortSqueeze: SymbolData[]; // This now correctly expects SymbolData[]
  topLongTrap: SymbolData[];     // This now correctly expects SymbolData[]
  totalLongLiquidationsUSD: number;
  totalShortLiquidationsUSD: number;
}

// NEW: Interface for NewsData to be passed to MarketAnalysisDisplay
export interface NewsData extends Array<SentimentArticle> {}


export interface MarketAnalysisResults {
  generalBias: MarketAnalysisResultDetail;
  fundingImbalance: MarketAnalysisResultDetail;
  shortSqueezeCandidates: MarketAnalysisResultDetail;
  longTrapCandidates: MarketAnalysisResultDetail;
  volumeSentiment: MarketAnalysisResultDetail;
  liquidationHeatmap: MarketAnalysisResultDetail;
  newsSentiment: MarketAnalysisResultDetail; // NEW: Added news sentiment
  overallSentimentAccuracy: string;
  overallMarketOutlook: {
    score: number;
    tone: string;
    strategySuggestion: string;
  };
  marketData: MarketData; // ADDED: Market data for detailed display
  newsData: NewsData;     // ADDED: News data for detailed display
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
  // *** CRITICAL CHANGE HERE ***
  // volumeData MUST be of type SymbolData[] when passed into analyzeSentiment
  volumeData: SymbolData[];
  liquidationData: AggregatedLiquidationData | undefined;
  newsArticles: SentimentArticle[]; // Assuming news is passed as part of MarketStats now
}

export interface SentimentSignal {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Neutral';
  reason: string;
}

export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string; // Absolute change
  priceChangePercent: string; // Percentage change (used for SymbolData)
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string; // Used for SymbolData
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string; // Base asset volume (used for SymbolData)
  quoteVolume: string; // Quote asset volume (e.g., USDT volume)
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
  time: number;
}

export interface BinanceSymbol {
  symbol: string;
  pair: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  status: string;
  maintMarginPercent: string;
  requiredMarginPercent: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  underlyingType: string;
  underlyingSubType: string[];
  settlePlan: number;
  triggerProtect: string;
  liquidationFee: string;
  marketTakeBound: string;
  maxMoveLimit: string;
  filters: any[]; // You might want to define more specific filter types
  orderTypes: string[];
  timeInForce: string[];
}

export interface BinanceExchangeInfoResponse {
  timezone: string;
  serverTime: number;
  rateLimits: any[]; // Specific type for rate limits could be added
  exchangeFilters: any[]; // Specific type for exchange filters could be added
  symbols: BinanceSymbol[];
}
