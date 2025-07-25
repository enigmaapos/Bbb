// src/types.ts

export interface SymbolData {
  symbol: string;
  priceChangePercent: number; // This is crucial
  fundingRate: number;
  lastPrice: number; // This is crucial
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


export interface SentimentArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  content?: string; // You'll need the article content for analysis
  sentimentScore?: number; // e.g., -1 to 1, or 0 to 100
  sentimentCategory?: 'positive' | 'negative' | 'neutral';
}


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

export interface NewsData extends Array<SentimentArticle> {}


export interface MarketAnalysisResults {
  generalBias: MarketAnalysisResultDetail;
  fundingImbalance: MarketAnalysisResultDetail;
  shortSqueezeCandidates: MarketAnalysisResultDetail;
  longTrapCandidates: MarketAnalysisResultDetail;
  volumeSentiment: MarketAnalysisResultDetail;
  liquidationHeatmap: MarketAnalysisResultDetail;
  newsSentiment: MarketAnalysisResultDetail;
  overallSentimentAccuracy: string;
  overallMarketOutlook: {
    score: number;
    tone: string;
    strategySuggestion: string;
  };
  marketData: MarketData;
  newsData: NewsData;
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
  volumeData: SymbolData[]; // This is the key: it must be SymbolData[]
  liquidationData: AggregatedLiquidationData | undefined;
  newsArticles: SentimentArticle[]; // Assuming news is passed as part of MarketStats now
}

export interface SentimentSignal {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Neutral';
  reason: string;
}

// These are the raw Binance API response types
export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string; // Absolute change
  priceChangePercent: string; // This is what SymbolData needs
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string; // This is what SymbolData needs
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
  lastFundingRate: string; // This is what SymbolData needs
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
  filters: any[];
  orderTypes: string[];
  timeInForce: string[];
}

export interface BinanceExchangeInfoResponse {
  timezone: string;
  serverTime: number;
  rateLimits: any[];
  exchangeFilters: any[];
  symbols: BinanceSymbol[];
}