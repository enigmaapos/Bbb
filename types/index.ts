// types.ts (or your shared types file)
// This file is already correct from your prompt, included for completeness.

export interface SymbolData {
symbol: string;
priceChangePercent: number;
fundingRate: number;
lastPrice: number;
volume: number;
sentimentSignal?: SentimentSignal; // Optional sentiment signal per symbol
}

export interface SymbolTradeSignal {
  symbol: string;
  signal: "buying zone" | "selling zone" | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  strength?: string;  // Make these optional
  confidence?: string;  // Make these optional
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

export interface MarketAnalysisResultDetail {
rating: string;
interpretation: string;
score: number; // Score from 0–10
topHeadlines?: string[]; // Optional for news sentiment only
}

export interface SentimentArticle {
title: string;
url: string;
source: string;
publishedAt: string;
content?: string;
sentimentScore?: number;
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

export interface NewsData extends Array<any> {} // Changed to Array<any> for better type safety

export interface SentimentSignal {
symbol: string;
signal: 'Bullish Opportunity' | 'Early Squeeze Signal' | 'Bearish Risk' | 'Early Long Trap' | 'Neutral'; // Updated to include Early Long Trap
reason: string;
priceChangePercent: number; // Added priceChangePercent as per the updated signalDetector.ts
   strongBuy?: boolean;
  strongSell?: boolean; 
    riskReward?: 'Low' | 'Medium' | 'Medium-High' | 'High' | 'Strong'; 
}

// New interface for actionable sentiment summary (aggregated counts + tone)
export interface ActionableSentimentSummary {
bullishCount: number;
bearishCount: number;
tone: 'Bullish' | 'Bearish' | 'Neutral';
interpretation: string;
score: number; // Score 0–10 for overall sentiment strength
}

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

// NEW: actionable sentiment signals per symbol and aggregated summary
actionableSentimentSignals?: SentimentSignal[];
actionableSentimentSummary?: ActionableSentimentSummary;
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
volumeData: SymbolData[];
liquidationData: AggregatedLiquidationData | undefined;
newsArticles: SentimentArticle[];
}

// Raw Binance API types (unchanged)
export interface BinanceTicker24hr {
symbol: string;
priceChange: string;
priceChangePercent: string;
weightedAvgPrice: string;
prevClosePrice: string;
lastPrice: string;
lastQty: string;
bidPrice: string;
bidQty: string;
askPrice: string;
askQty: string;
openPrice: string;
highPrice: string;
lowPrice: string;
volume: string;
quoteVolume: string;
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
