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
