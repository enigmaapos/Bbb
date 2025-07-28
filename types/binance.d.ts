// types/binance.d.ts

/**
 * Interface for a single symbol object within the Binance exchangeInfo response.
 */
export interface BinanceSymbol {
  symbol: string;
  status: string;
  maintMarginPercent: string;
  requiredMarginPercent: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  underlyingType: string;
  settlePlan: string[];
  triggerProtect: string;
  deliveryDate: number;
  onboardDate: number;
  contractType: "PERPETUAL" | "DELIVERY_SETTLE" | "DELIVERY_EXERCISE"; // Added common types
  // Add other properties if you need them, you can find the full structure in Binance API documentation
}

/**
 * Interface for the overall Binance exchangeInfo API response.
 */
export interface BinanceExchangeInfoResponse {
  timezone: string;
  serverTime: number;
  rateLimits: any[]; // You can define a more specific interface for rate limits if needed
  exchangeFilters: any[]; // You can define a more specific interface for exchange filters if needed
  symbols: BinanceSymbol[];
}

/**
 * Interface for Binance 24hr Ticker response for a single symbol.
 */
export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string; // Base asset volume
  quoteVolume: string; // Quote asset volume
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

/**
 * Interface for Binance Premium Index / Funding Rate response for a single symbol.
 */
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

/**
 * Interface for Binance Open Interest History response for a single entry.
 */
export interface BinanceOpenInterestHistory {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string; // This is the USD value you're looking for
  timestamp: number;
}
