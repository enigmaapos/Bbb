// pages/index.tsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Head from "next/head";
import FundingSentimentChart from "../components/FundingSentimentChart";
import MarketAnalysisDisplay from "../components/MarketAnalysisDisplay";
import LeverageProfitCalculator from "../components/LeverageProfitCalculator";
import LiquidationHeatmap from "../components/LiquidationHeatmap";
import SiteADataLoader from "../components/SiteADataLoader";
import {
  SymbolData,
  SymbolTradeSignal,
  MarketStats,
  LiquidationEvent,
  AggregatedLiquidationData,
  MarketAnalysisResults,
  SentimentArticle,
  SiteAData, // Added this import
} from "../types";
import {
  BinanceExchangeInfoResponse,
  BinanceSymbol,
  BinanceTicker24hr,
  BinancePremiumIndex,
} from "../types/binance";
import { analyzeSentiment } from "../utils/sentimentAnalyzer";
import { getMarketData, fetchAggregatedLiquidationData } from "../utils/binanceApi"; // CORRECTED: Moved import here.
import { getNewsSentiment } from "../utils/newsSentiment"; // Corrected import path for news sentiment
import { detectSentimentSignals } from "../utils/signalDetector";
import axios, { AxiosError } from 'axios';
import { fetchCryptoNews } from "../utils/newsFetcher";

// NOTE: This temporary definition should be moved to a shared types file (e.g., types.ts)
interface SentimentSignal {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Early Squeeze Signal' | 'Early Long Trap' | string;
  reason?: string;
  strongBuy?: boolean;
  strongSell?: boolean;
  priceChangePercent: number;
}

// Custom type guard for AxiosError
function isAxiosErrorTypeGuard(error: any): error is import("axios").AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    error.isAxiosError === true
  );
}

const BINANCE_API = "https://fapi.binance.com";
const BINANCE_WS_URL = "wss://fstream.binance.com/ws/!forceOrder@arr";

// Helper function to format large numbers with M, B, T suffixes
const formatVolume = (num: number): string => {
  if (num === 0) return "0";
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return formatter.format(num);
};

// Helper function to format time for Davao City
const formatDavaoTime = (): string => {
  const now = new Date();
  const davaoTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true,
  }).format(now);
  return davaoTime;
};

export default function PriceFundingTracker() {
  const priceChangeThreshold = 2;
  const fundingRateThreshold = 0.0001;
  const highPriceChangeThreshold = 5;
  const highFundingRateThreshold = 0.0003;
  const mediumPriceChangeThreshold = 3;
  const mediumFundingRateThreshold = 0.0002;
  const volumeThreshold = 50_000_000;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [siteAData, setSiteAData] = useState<SiteAData | null>(null); // Added SiteAData state

  const [rawData, setRawData] = useState<SymbolData[]>([]);
  const [tradeSignals, setTradeSignals] = useState<SymbolTradeSignal[]>([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [greenPositiveFunding, setGreenPositiveFunding] = useState(0);
  const [greenNegativeFunding, setGreenNegativeFunding] = useState(0);
  const [redPositiveFunding, setRedPositiveFunding] = useState(0);
  const [redNegativeFunding, setRedNegativeFunding] = useState(0);
  const [priceUpFundingNegativeCount, setPriceUpFundingNegativeCount] = useState(0);
  const [priceDownFundingPositiveCount, setPriceDownFundingPositiveCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const [sortConfig, setSortConfig] = useState<{
    key: "fundingRate" | "priceChangePercent" | "signal" | null;
    direction: "asc" | "desc" | null;
  }>({ key: "fundingRate", direction: "desc" });

  const [searchTerm, setSearchTerm] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const savedFavorites = localStorage.getItem('favorites');
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    }
    return [];
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [actionableSentimentSignals, setActionableSentimentSignals] = useState<SentimentSignal[]>([]);
  const [cryptoNews, setCryptoNews] = useState<SentimentArticle[]>([]);

  const liquidationEventsRef = useRef<LiquidationEvent[]>([]);
  const [recentLiquidationEvents, setRecentLiquidationEvents] = useState<LiquidationEvent[]>([]);
  const [aggregatedLiquidationForSentiment, setAggregatedLiquidationForSentiment] = useState<
    AggregatedLiquidationData | undefined
  >(undefined);

  const liquidationWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsPingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const aggregationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('favorites', JSON.stringify(favorites));
    }
  }, [favorites]);

  const [fundingImbalanceData, setFundingImbalanceData] = useState({
    priceUpShortsPaying: 0,
    priceUpLongsPaying: 0,
    priceDownLongsPaying: 0,
    priceDownShortsPaying: 0,
    topShortSqueeze: [] as SymbolData[],
    topLongTrap: [] as SymbolData[],
  });

  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResults>({
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    newsSentiment: { rating: "", interpretation: "", score: 0 },
    actionableSentimentSignals: [],
    actionableSentimentSummary: { bullishCount: 0, bearishCount: 0, tone: "Neutral", interpretation: "", score: 0 },
    overallSentimentAccuracy: "",
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
    marketData: {
      greenCount: 0,
      redCount: 0,
      greenPositiveFunding: 0,
      greenNegativeFunding: 0,
      redPositiveFunding: 0,
      redNegativeFunding: 0,
      priceUpFundingNegativeCount: 0,
      priceDownFundingPositiveCount: 0,
      topShortSqueeze: [],
      topLongTrap: [],
      totalLongLiquidationsUSD: 0,
      totalShortLiquidationsUSD: 0,
    },
    newsData: [],
    siteAData: null, // Added siteAData to marketAnalysis
  });

  const generateTradeSignals = useCallback((combinedData: SymbolData[]): SymbolTradeSignal[] => {
    return combinedData.map(({ symbol, priceChangePercent, fundingRate, lastPrice, volume }) => {
      let signal: "long" | "short" | null = null;
      let strength: SymbolTradeSignal['strength'] = "Weak";
      let confidence: SymbolTradeSignal['confidence'] = "Low Confidence";

      if (priceChangePercent >= priceChangeThreshold && fundingRate < -fundingRateThreshold) {
        signal = "long";
        if (priceChangePercent >= highPriceChangeThreshold && fundingRate <= -highFundingRateThreshold && volume >= volumeThreshold) {
          strength = "Strong";
          confidence = "High Confidence";
        } else if (priceChangePercent >= mediumPriceChangeThreshold && fundingRate <= -mediumFundingRateThreshold) {
          strength = "Medium";
          confidence = "Medium Confidence";
        }
      } else if (priceChangePercent <= -priceChangeThreshold && fundingRate > fundingRateThreshold) {
        signal = "short";
        if (priceChangePercent <= -highPriceChangeThreshold && fundingRate >= highFundingRateThreshold && volume >= volumeThreshold) {
          strength = "Strong";
          confidence = "High Confidence";
        } else if (priceChangePercent <= -mediumPriceChangeThreshold && fundingRate >= mediumFundingRateThreshold) {
          strength = "Medium";
          confidence = "Medium Confidence";
        }
      }

      if (signal === null) {
        strength = "Weak";
        confidence = "Low Confidence";
      }

      return { symbol, signal, strength, confidence, entry: null, stopLoss: null, takeProfit: null };
    });
  }, [
    priceChangeThreshold,
    fundingRateThreshold,
    highPriceChangeThreshold,
    highFundingRateThreshold,
    mediumPriceChangeThreshold,
    mediumFundingRateThreshold,
    volumeThreshold,
  ]);

  const aggregateLiquidationEvents = useCallback((events: LiquidationEvent[]): AggregatedLiquidationData => {
    let totalLongLiquidationsUSD = 0;
    let totalShortLiquidationsUSD = 0;
    let longLiquidationCount = 0;
    let shortLiquidationCount = 0;

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentEvents = events.filter(e => e.timestamp > fiveMinutesAgo);

    recentEvents.forEach((event) => {
      const volumeUSD = event.price * event.quantity;
      if (event.side === "SELL") {
        totalLongLiquidationsUSD += volumeUSD;
        longLiquidationCount++;
      } else {
        totalShortLiquidationsUSD += volumeUSD;
        shortLiquidationCount++;
      }
    });

    return {
      totalLongLiquidationsUSD,
      totalShortLiquidationsUSD,
      longLiquidationCount,
      shortLiquidationCount,
    };
  }, []);

  const connectLiquidationWs = useCallback(() => {
    if (liquidationWsRef.current && (liquidationWsRef.current.readyState === WebSocket.OPEN || liquidationWsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('Liquidation WS already open or connecting. Skipping new connection attempt.');
      return;
    }

    console.log('Attempting to connect to Liquidation WS...');
    const ws = new WebSocket(BINANCE_WS_URL);

    ws.onopen = () => {
      console.log('Liquidation WS connected');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsPingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            method: "PING"
          }));
          console.log('Liquidation WS: Sent Ping frame/message.');
        }
      }, 3 * 60 * 1000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.e === 'forceOrder') {
          const liquidationEvent: LiquidationEvent = {
            symbol: data.o.s,
            side: data.o.S as "BUY" | "SELL",
            price: parseFloat(data.o.ap),
            quantity: parseFloat(data.o.q),
            timestamp: data.o.T,
          };

          setRecentLiquidationEvents(prev => {
            const updated = [liquidationEvent, ...prev].slice(0, 10);
            return updated;
          });

          liquidationEventsRef.current.push(liquidationEvent);

          if (liquidationEventsRef.current.length > 1000) {
            liquidationEventsRef.current = liquidationEventsRef.current.slice(liquidationEventsRef.current.length - 1000);
          }

          if (aggregationTimeoutRef.current) {
            clearTimeout(aggregationTimeoutRef.current);
          }
          aggregationTimeoutRef.current = setTimeout(() => {
            const aggregated = aggregateLiquidationEvents(liquidationEventsRef.current);
            setAggregatedLiquidationForSentiment(aggregated);
          }, 500);
        }
      } catch (e) {
        console.error('Error parsing WS message or processing liquidation event:', e);
      }
    };

    ws.onclose = (event) => {
      console.warn('Liquidation WS closed:', event.code, event.reason);
      if (wsPingIntervalRef.current) {
        clearInterval(wsPingIntervalRef.current);
        wsPingIntervalRef.current = null;
      }

      if (event.code !== 1000 && event.code !== 1001) {
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Reconnecting Liquidation WS...');
            connectLiquidationWs();
          }, 5000);
        }
      } else {
        console.log('Liquidation WS closed normally or intentionally.');
      }
    };

    ws.onerror = (errorEvent) => {
      console.error('Liquidation WS error:', errorEvent);
      liquidationWsRef.current?.close();
    };

    liquidationWsRef.current = ws;
  }, [aggregateLiquidationEvents]);

  // --- Main Data Fetching and WebSocket Management Effect ---
  useEffect(() => {
    const fetchAllData = async () => {
      if (rawData.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        const [marketData, liquidationData, newsArticles] = await Promise.all([
          getMarketData(),
          fetchAggregatedLiquidationData(),
          getNewsSentiment(),
        ]);

        // COMBINING ALL DATA FOR SENTIMENT ANALYSIS
        const marketStats: MarketStats = {
          ...marketData,
          liquidationData: liquidationData,
          newsArticles: newsArticles,
          siteAData: siteAData, // Pass siteAData to marketStats
        };

        const analysisResults = analyzeSentiment(marketStats);

        const allSentimentSignals = detectSentimentSignals(marketData.volumeData);
        analysisResults.actionableSentimentSignals = allSentimentSignals;
        analysisResults.marketData = {
          ...analysisResults.marketData,
          ...marketData.fundingStats,
          ...liquidationData,
        };

        const topShortSqueeze = marketData.volumeData
          .filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0)
          .sort((a, b) => a.fundingRate - b.fundingRate)
          .slice(0, 5);

        const topLongTrap = marketData.volumeData
          .filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0)
          .sort((a, b) => b.fundingRate - a.fundingRate)
          .slice(0, 5);

        setFundingImbalanceData({
          ...fundingImbalanceData,
          priceUpShortsPaying: marketData.fundingStats.greenNegativeFunding,
          priceUpLongsPaying: marketData.fundingStats.greenPositiveFunding,
          priceDownLongsPaying: marketData.fundingStats.redPositiveFunding,
          priceDownShortsPaying: marketData.fundingStats.redNegativeFunding,
          topShortSqueeze,
          topLongTrap,
        });

        const signals = generateTradeSignals(marketData.volumeData);
        setTradeSignals(signals);
        setMarketAnalysis(analysisResults);
        setLastUpdated(formatDavaoTime());
        setRawData(marketData.volumeData);

      } catch (err: any) {
        console.error("Error fetching initial market data or news:", err);
        if (isAxiosErrorTypeGuard(err) && err.response) {
          setError(`Failed to fetch initial market data: ${err.response.status}`);
        } else {
          setError("Failed to fetch initial market data. Unknown error.");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000); // Changed interval to 60s
    connectLiquidationWs();
    return () => {
      console.log('Cleaning up effects...');
      clearInterval(interval);
      if (liquidationWsRef.current) {
        liquidationWsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsPingIntervalRef.current) {
        clearInterval(wsPingIntervalRef.current);
      }
      if (aggregationTimeoutRef.current) {
        clearTimeout(aggregationTimeoutRef.current);
      }
    };
  }, [siteAData, generateTradeSignals, connectLiquidationWs, aggregatedLiquidationForSentiment]); // Added dependencies to useEffect

  const filteredRawData = useMemo(() => {
    const data = showFavoritesOnly ? rawData.filter(d => favorites.includes(d.symbol)) : rawData;
    return data.filter(d => d.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [rawData, searchTerm, showFavoritesOnly, favorites]);

  // Handle sorting logic for trade signals
  const sortedRawData = useMemo(() => {
    if (!sortConfig.key) {
      return filteredRawData;
    }
    return [...filteredRawData].sort((a, b) => {
      if (a[sortConfig.key!] < b[sortConfig.key!]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key!] > b[sortConfig.key!]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredRawData, sortConfig]);

  const getFundingRateColor = (rate: number) => {
    if (rate > fundingRateThreshold) return "green";
    if (rate < -fundingRateThreshold) return "red";
    return "gray";
  };

  const getPriceChangeColor = (change: number) => {
    if (change > priceChangeThreshold) return "green";
    if (change < -priceChangeThreshold) return "red";
    return "gray";
  };

  const handleSort = (key: "fundingRate" | "priceChangePercent" | "signal") => {
    setSortConfig(prev => {
      let direction: "asc" | "desc" | null = "asc";
      if (prev.key === key && prev.direction === "asc") {
        direction = "desc";
      } else if (prev.key === key && prev.direction === "desc") {
        direction = null;
        key = null;
      }
      return { key, direction };
    });
  };

  const handleFavoriteToggle = (symbol: string) => {
    setFavorites(prev =>
      prev.includes(symbol)
        ? prev.filter(fav => fav !== symbol)
        : [...prev, symbol]
    );
  };

  return (
    <>
      <Head>
        <title>Binance Perpetual Futures Sentiment Analysis</title>
        <meta
          name="description"
          content="Real-time sentiment analysis for Binance perpetual futures."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1>Binance Perpetual Futures Sentiment Analysis</h1>
            <div style={{ textAlign: 'right' }}>
              <p>
                Updated: {lastUpdated}
              </p>
              <p>
                <code style={{ fontSize: '0.8rem' }}>Davao City Time (GMT+8)</code>
              </p>
            </div>
          </div>

          <SiteADataLoader onDataLoaded={setSiteAData} />

          {loading ? (
            <p>Loading market data...</p>
          ) : error ? (
            <p style={{ color: 'red' }}>Error: {error}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <MarketAnalysisDisplay
                marketAnalysis={marketAnalysis}
                showDetails={true}
              />
              <div>
                <h2>Liquidation Heatmap (Real-time from WebSocket)</h2>
                <p>Total Long Liquidations (5m): ${aggregatedLiquidationForSentiment?.totalLongLiquidationsUSD.toFixed(2)}</p>
                <p>Total Short Liquidations (5m): ${aggregatedLiquidationForSentiment?.totalShortLiquidationsUSD.toFixed(2)}</p>
                <LiquidationHeatmap recentEvents={recentLiquidationEvents} />
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
