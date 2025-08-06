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
  // SentimentSignal, // Removed import from types.ts temporarily to define locally
  SentimentArticle,
} from "../types";
import {
  BinanceExchangeInfoResponse,
  BinanceSymbol,
  BinanceTicker24hr,
  BinancePremiumIndex,
} from "../types/binance";
import { analyzeSentiment } from "../utils/sentimentAnalyzer";
import { detectSentimentSignals } from "../utils/signalDetector"; // Re-enabled original import
import axios, { AxiosError } from 'axios';
import { fetchCryptoNews } from "../utils/newsFetcher";

// --- TEMPORARY SentimentSignal DEFINITION ---
// YOU SHOULD MOVE THIS TO YOUR types.ts FILE
interface SentimentSignal {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Early Squeeze Signal' | 'Early Long Trap' | string;
  reason?: string; // Made optional, as it might not always be present
  strongBuy?: boolean; // Made optional
  strongSell?: boolean; // Made optional
  priceChangePercent: number; // Added this based on the error message
  // Add any other properties that your actual detectSentimentSignals function might return
  // or that are part of your existing SentimentSignal type in types.ts
}
// --- END TEMPORARY SentimentSignal DEFINITION ---


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
  // Ensure the timeZone is 'Asia/Manila' for Davao City
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

  // This state already holds all sentiment signals
  const [actionableSentimentSignals, setActionableSentimentSignals] = useState<SentimentSignal[]>([]);

  // State for news data
  const [cryptoNews, setCryptoNews] = useState<SentimentArticle[]>([]);

  // Liquidation data states
  const liquidationEventsRef = useRef<LiquidationEvent[]>([]);
  const [recentLiquidationEvents, setRecentLiquidationEvents] = useState<LiquidationEvent[]>([]);
  const [aggregatedLiquidationForSentiment, setAggregatedLiquidationForSentiment] = useState<
    AggregatedLiquidationData | undefined
  >(undefined);

  // WebSocket specific refs for persistent instances
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
      if (event.side === "SELL") { // SELL means long position liquidated
        totalLongLiquidationsUSD += volumeUSD;
        longLiquidationCount++;
      } else { // BUY means short position liquidated
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
        // Fetch news concurrently with market data
        const [infoRes, tickerRes, fundingRes, btcNews, ethNews] = await Promise.all([
          axios.get<BinanceExchangeInfoResponse>(`${BINANCE_API}/fapi/v1/exchangeInfo`),
          axios.get<BinanceTicker24hr[]>(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          axios.get<BinancePremiumIndex[]>(`${BINANCE_API}/fapi/v1/premiumIndex`),
          fetchCryptoNews("bitcoin"), // Fetch Bitcoin news
          fetchCryptoNews("ethereum"), // Fetch Ethereum news
        ]);

        const allFetchedNews: SentimentArticle[] = [
          ...btcNews,
          ...ethNews,
        ];
        setCryptoNews(allFetchedNews); // Store news in state

        const usdtPairs = infoRes.data.symbols
          .filter((s: BinanceSymbol) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: BinanceSymbol) => s.symbol);

        const tickerData = tickerRes.data;
        const fundingData = fundingRes.data;

        let combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t) => t.symbol === symbol);
          const funding = fundingData.find((f) => f.symbol === symbol);
          const lastPrice = parseFloat(ticker?.lastPrice || "0");
          const volume = parseFloat(ticker?.quoteVolume || "0");

          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: lastPrice,
            volume: volume,
          };
        }).filter((d: SymbolData) => d.volume > 0);

        const allSentimentSignals = detectSentimentSignals(combinedData);

        combinedData = combinedData.map(d => ({
          ...d,
          sentimentSignal: allSentimentSignals.find(s => s.symbol === d.symbol)
        }));

        const topShortSqueeze = combinedData
          .filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0)
          .sort((a, b) => a.fundingRate - b.fundingRate)
          .slice(0, 5);

        const topLongTrap = combinedData
          .filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0)
          .sort((a, b) => b.fundingRate - a.fundingRate)
          .slice(0, 5);

        const filteredActionableSignals = allSentimentSignals.filter(s =>
            s.signal === 'Bullish Opportunity' ||
            s.signal === 'Bearish Risk' ||
            s.signal === 'Early Squeeze Signal' ||
            s.signal === 'Early Long Trap'
        );
        setActionableSentimentSignals(filteredActionableSignals);


        setRawData(combinedData);

        const green = combinedData.filter((d) => d.priceChangePercent >= 0).length;
        const red = combinedData.length - green;
        setGreenCount(green);
        setRedCount(red);

        const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        setGreenPositiveFunding(gPos);
        setGreenNegativeFunding(gNeg);
        setRedPositiveFunding(rPos);
        setRedNegativeFunding(rNeg);

        const priceUpFundingNegative = combinedData.filter(
          (d) => d.priceChangePercent > 0 && d.fundingRate < 0
        ).length;
        const priceDownFundingPositive = combinedData.filter(
          (d) => d.priceChangePercent < 0 && d.fundingRate > 0
        ).length;

        setPriceUpFundingNegativeCount(priceUpFundingNegative);
        setPriceDownFundingPositiveCount(priceDownFundingPositive);

        const priceUpShortsPaying = combinedData.filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0).length;
        const priceUpLongsPaying = combinedData.filter((d) => d.priceChangePercent > 0 && d.fundingRate > 0).length;
        const priceDownLongsPaying = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0).length;
        const priceDownShortsPaying = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        setFundingImbalanceData({
          priceUpShortsPaying,
          priceUpLongsPaying,
          priceDownLongsPaying,
          priceDownShortsPaying,
          topShortSqueeze,
          topLongTrap,
        });

        const signals = generateTradeSignals(combinedData);
        setTradeSignals(signals);
        setLastUpdated(formatDavaoTime());


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
    const interval = setInterval(fetchAllData, 30000);

    connectLiquidationWs();

    return () => {
      console.log('Cleaning up effects...');
      clearInterval(interval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsPingIntervalRef.current) {
        clearInterval(wsPingIntervalRef.current);
        wsPingIntervalRef.current = null;
      }
      if (liquidationWsRef.current) {
        liquidationWsRef.current.close(1000, 'Component Unmounted');
        liquidationWsRef.current = null;
      }
      if (aggregationTimeoutRef.current) {
        clearTimeout(aggregationTimeoutRef.current);
        aggregationTimeoutRef.current = null;
      }
    };
  }, [generateTradeSignals, aggregateLiquidationEvents, rawData.length, connectLiquidationWs]);

  // --- Effect to run Sentiment Analysis when market data or liquidation data or news data changes ---
  useEffect(() => {
    // Only run sentiment analysis if we have rawData, liquidation data, or news
    if (rawData.length === 0 && !aggregatedLiquidationForSentiment && cryptoNews.length === 0) return;

    const marketStatsForAnalysis: MarketStats = {
      green: greenCount,
      red: redCount,
      fundingStats: {
        greenPositiveFunding: greenPositiveFunding,
        greenNegativeFunding: greenNegativeFunding,
        redPositiveFunding: redPositiveFunding,
        redNegativeFunding: redNegativeFunding,
      },
      volumeData: rawData,
      liquidationData: aggregatedLiquidationForSentiment,
      newsArticles: cryptoNews,
    };

    const sentimentResults = analyzeSentiment(marketStatsForAnalysis);
    setMarketAnalysis(sentimentResults);

  }, [
    rawData,
    aggregatedLiquidationForSentiment,
    greenCount, redCount, greenPositiveFunding, greenNegativeFunding, redPositiveFunding, redNegativeFunding,
    cryptoNews,
    priceUpFundingNegativeCount, priceDownFundingPositiveCount, fundingImbalanceData.topShortSqueeze, fundingImbalanceData.topLongTrap,
  ]);


  const handleSort = (key: "fundingRate" | "priceChangePercent" | "signal") => {
    setSortConfig((prevConfig) => {
      let direction: "asc" | "desc" = "desc";
      if (prevConfig.key === key) {
        if (prevConfig.direction === "desc") {
          direction = "asc";
        } else if (prevConfig.direction === "asc") {
          direction = "desc";
        }
      } else {
        direction = "desc";
        if (key === "signal") {
          direction = "desc";
        }
      }
      return { key, direction };
    });
  };

  const sortedData = useMemo(() => {
    const sortableData = [...rawData];
    if (!sortConfig.key) return sortableData;

    return sortableData.sort((a, b) => {
      const order = sortConfig.direction === "asc" ? 1 : -1;

      if (sortConfig.key === "signal") {
        const signalA = tradeSignals.find((s) => s.symbol === a.symbol);
        const signalB = tradeSignals.find((s) => s.symbol === b.symbol);

        const rank = (s: SymbolTradeSignal | undefined) => {
          if (s?.signal === "long") return 0;
          if (s?.signal === "short") return 1;
          return 2;
        };

        const rankA = rank(signalA);
        const rankB = rank(signalB);

        return (rankA - rankB) * order;
      }
      else if (sortConfig.key === "fundingRate") {
        return (a.fundingRate - b.fundingRate) * order;
      } else if (sortConfig.key === "priceChangePercent") {
        return (a.priceChangePercent - b.priceChangePercent) * order;
      }
      return 0;
    });
  }, [rawData, sortConfig, tradeSignals]);

  const filteredAndSortedData = useMemo(() => {
    return sortedData.filter((item) => {
      return (
        (!searchTerm || item.symbol.includes(searchTerm)) &&
        (!showFavoritesOnly || favorites.includes(item.symbol))
      );
    });
  }, [sortedData, searchTerm, showFavoritesOnly, favorites]);


  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen text-white text-lg bg-gray-900">
        Loading market data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen text-red-500 text-lg bg-gray-900">
        Error: {error}
      </div>
    );
  }

  // Filter actionable signals to only include BTCUSDT and ETHUSDT
  const btcEthActionableSignals = actionableSentimentSignals.filter(s =>
    s.symbol === 'BTCUSDT' || s.symbol === 'ETHUSDT'
  );

  const bullishActionableSignals = btcEthActionableSignals.filter(s => s.signal === 'Bullish Opportunity');
  const bearishActionableSignals = btcEthActionableSignals.filter(s => s.signal === 'Bearish Risk');
  const earlySqueezeSignals = btcEthActionableSignals.filter(s => s.signal === 'Early Squeeze Signal');
  const earlyLongTrapSignals = btcEthActionableSignals.filter(s => s.signal === 'Early Long Trap');

  // These now correctly filter from actionableSentimentSignals, which should adhere to the new SentimentSignal type
  const top5BullishPositiveFundingSignals = bullishActionableSignals.slice(0, 5);
  const top5BearishNegativeFundingSignals = bearishActionableSignals.slice(0, 5);


  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <Head>
        <title>Binance USDT Perpetual Tracker</title>
        <meta name="description" content="Real-time Binance USDT Perpetual Tracker with Sentiment Analysis and Liquidation Data" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-3 text-blue-400">📈 Binance USDT Perpetual Tracker</h1>
        <p className="text-sm text-gray-400 mb-6">Last Updated (Davao City): {lastUpdated}</p>


        <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">
            📊 Market Summary
            <span
              title="Tracks how price movement and funding rate interact across all perpetual USDT pairs"
              className="text-sm text-gray-400 ml-2 cursor-help"
            >
              ℹ️
            </span>
          </h2>

          <div className="text-sm space-y-4">
            <div>
              <p className="text-gray-400 font-semibold mb-1">🧮 General Market Bias:</p>
              ✅ <span className="text-green-400 font-bold">Green</span>: {greenCount} &nbsp;&nbsp;
              ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}
            </div>

            <div>
              <p className="text-blue-300 font-semibold mb-1">🔄 24h Price Change:</p>
              <ul className="text-blue-100 ml-4 list-disc space-y-1">
                <li><span className="font-semibold text-green-400">Price Increase (≥ 5%)</span>: {
                  rawData.filter((item) => item.priceChangePercent >= 5).length
                }</li>
                <li><span className="font-semibold text-yellow-300">Mild Movement (±0–5%)</span>: {
                  rawData.filter((item) => item.priceChangePercent > -5 && item.priceChangePercent < 5).length
                }</li>
                <li><span className="font-semibold text-red-400">Price Drop (≤ -5%)</span>: {
                  rawData.filter((item) => item.priceChangePercent <= -5).length
                }</li>
              </ul>
            </div>

            <div>
              <p className="text-green-300 font-semibold mb-1">📈 Bullish Potential (Shorts Paying):</p>
              <span className="text-green-400">Green + Funding ➕:</span>{" "}
              <span className="text-green-300 font-bold">{greenPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-red-400">➖:</span>{" "}
              <span className="text-red-300 font-bold">{greenNegativeFunding}</span>
            </div>

            <div>
              <p className="text-red-300 font-semibold mb-1">📉 Bearish Risk (Longs Paying):</p>
              <span className="text-red-400">Red + Funding ➕:</span>{" "}
              <span className="text-green-300 font-bold">{redPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-yellow-300">➖:</span>{" "}
              <span className="text-red-200 font-bold">{redNegativeFunding}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <FundingSentimentChart
            greenPositiveFunding={greenPositiveFunding}
            greenNegativeFunding={greenNegativeFunding}
            redPositiveFunding={redPositiveFunding}
            redNegativeFunding={redNegativeFunding}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-green-900/40 border border-green-600 p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-bold text-green-300 mb-2">🟢 Bullish Divergence</h2>
            <p className="text-sm text-green-100 mb-2">
              Shorts are paying while price is going up. This creates **squeeze potential**, especially near resistance.
            </p>

            <div className="flex items-center justify-between text-sm text-green-200 mb-2">
              🔼 Price Up + Funding ➖
              <span className="bg-green-700 px-2 py-1 rounded-full font-bold">{priceUpFundingNegativeCount}</span>
            </div>

            {priceUpFundingNegativeCount > 10 && (
              <div className="mt-3 bg-green-800/30 border border-green-600 p-3 rounded-md text-green-200 text-sm font-semibold">
                ✅ Opportunity: Look for **bullish breakouts** or **dip entries** in coins where shorts are paying.
              </div>
            )}
          </div>

          <div className="bg-red-900/40 border border-red-600 p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-bold text-red-300 mb-2">🔴 Bearish Trap</h2>
            <p className="text-sm text-red-100 mb-2">
              Longs are paying while price is dropping. This means bulls are **trapped**, and deeper selloffs may follow.
            </p>

            <div className="flex items-center justify-between text-sm text-red-200 mb-2">
              🔽 Price Down + Funding ➕
              <span className="bg-red-700 px-2 py-1 rounded-full font-bold">{priceDownFundingPositiveCount}</span>
            </div>

            {priceDownFundingPositiveCount > 10 && (
              <div className="mt-3 bg-red-800/30 border border-red-600 p-3 rounded-md text-red-200 text-sm font-semibold">
                ⚠️ Caution: Avoid **longs** on coins still dropping with positive funding — potential liquidation zone.
              </div>
            )}
          </div>
        </div>

        <MarketAnalysisDisplay
          marketAnalysis={marketAnalysis}
          fundingImbalanceData={fundingImbalanceData}
          greenCount={greenCount}
          redCount={redCount}
          greenPositiveFunding={greenPositiveFunding}
          greenNegativeFunding={greenNegativeFunding}
          redPositiveFunding={redPositiveFunding}
          redNegativeFunding={redNegativeFunding}
        />

        <div className="mb-8">
          <LiquidationHeatmap
            liquidationEvents={recentLiquidationEvents}
          />
        </div>

        {cryptoNews.length > 0 && (
          <section className="mt-6 p-4 bg-gray-800 rounded-lg text-sm border border-gray-700 shadow-md">
            <h3 className="text-white font-semibold mb-3 flex items-center">
              📰 Crypto Macro News
              <span
                title="Recent headlines for Bitcoin and Ethereum, providing macro market context."
                className="text-sm text-gray-400 ml-2 cursor-help"
              >
                ℹ️
              </span>
            </h3>
            <ul className="list-disc list-inside space-y-2">
              {cryptoNews.map((article, i) => (
                <li key={i} className="text-gray-300 leading-tight">
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    {article.title}
                  </a>
                  <span className="text-gray-500 ml-2 text-xs">({article.source})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(
          top5BullishPositiveFundingSignals.length > 0 ||
          earlySqueezeSignals.length > 0 ||
          top5BearishNegativeFundingSignals.length > 0 ||
          earlyLongTrapSignals.length > 0
        ) && (
          <div className="mt-8 p-4 border border-blue-700 rounded-lg bg-blue-900/40 shadow-md">
            <h2 className="text-xl font-bold text-blue-300 mb-4">✨ Actionable Sentiment Signals (BTC & ETH Only)</h2>
            <p className="text-yellow-300 text-sm mb-4 p-2 bg-yellow-900/30 border border-yellow-700 rounded-md">
              <strong>💡 Strategy Note:</strong> These signals are most effective when the overall market sentiment (as indicated in "Market Analysis") aligns with the signal.
              <br />
              For <strong>long opportunities</strong>, consider waiting for pullbacks to the <strong>200 EMA zone</strong> on the daily timeframe for better entry.
              <br />
              For <strong>short opportunities</strong>, consider waiting for bounces to <strong>resistance or the 200 EMA zone</strong> before entering.
            </p>

            {top5BullishPositiveFundingSignals.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-green-400 mb-2">🟢 Top 5 Bullish Opportunities</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {top5BullishPositiveFundingSignals.map((signal, index) => (
                    <div key={index} className="p-3 rounded-md bg-green-700/50 border border-green-500">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-green-300">{signal.symbol}</h4>
                        {/* Render strongBuy only if it exists and is true */}
                        {signal.strongBuy && <span className="text-xs text-white bg-green-800 px-2 py-0.5 rounded-md">✅ Strong Buy</span>}
                      </div>
                      {/* Render reason only if it exists */}
                      {signal.reason && <p className="text-gray-200 text-xs">{signal.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {earlySqueezeSignals.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-orange-400 mb-2">🟠 Early Squeeze Signals</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {earlySqueezeSignals.map((signal, index) => (
                    <div key={index} className="p-3 rounded-md bg-orange-700/40 border border-orange-500">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-orange-300">{signal.symbol}</h4>
                        {signal.strongBuy && <span className="text-xs text-white bg-orange-800 px-2 py-0.5 rounded-md">🚀 Strong Buy</span>}
                      </div>
                      {signal.reason && <p className="text-gray-200 text-xs">{signal.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {earlyLongTrapSignals.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-purple-400 mb-2">🟣 Early Long Trap Signals</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {earlyLongTrapSignals.map((signal, index) => (
                    <div key={index} className="p-3 rounded-md bg-purple-700/40 border border-purple-500">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-purple-300">{signal.symbol}</h4>
                        {signal.strongSell && <span className="text-xs text-white bg-purple-800 px-2 py-0.5 rounded-md">⚠️ Strong Sell</span>}
                      </div>
                      {signal.reason && <p className="text-gray-200 text-xs">{signal.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {top5BearishNegativeFundingSignals.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-red-400 mb-2">🔴 Top 5 Bearish Risks</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {top5BearishNegativeFundingSignals.map((signal, index) => (
                    <div key={index} className="p-3 rounded-md bg-red-700/50 border border-red-500">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-red-300">{signal.symbol}</h4>
                        {signal.strongSell && <span className="text-xs text-white bg-red-800 px-2 py-0.5 rounded-md">🔻 Strong Sell</span>}
                      </div>
                      {signal.reason && <p className="text-gray-200 text-xs">{signal.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <SiteADataLoader />

        <div className="my-8 h-px bg-gray-700" />

        <div className="mb-8">
          <LeverageProfitCalculator />
        </div>

        <div className="my-8 h-px bg-gray-700" />

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="🔍 Search symbol (e.e. BTCUSDT)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
              className="bg-gray-800 border border-gray-700 px-4 py-2 pr-10 rounded-md text-sm w-full"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                ❌
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-3 py-2 rounded-md text-sm ${
                showFavoritesOnly ? "bg-yellow-500 text-black" : "bg-gray-700 text-white"
              }`}
            >
              {showFavoritesOnly ? "⭐ Favorites" : "☆ All"}
            </button>
            <button
              onClick={() => {
                setSearchTerm("");
                setShowFavoritesOnly(false);
              }}
              className="bg-red-600 px-3 py-2 rounded-md text-sm text-white"
            >
              ❌ Clear
            </button>
          </div>
        </div>


        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs sticky top-0 z-10">
              <tr>
                <th className="p-2">Symbol</th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => handleSort("priceChangePercent")}
                >
                  24h Change {sortConfig.key === "priceChangePercent" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
                </th>
                <th className="p-2">24h Volume</th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => handleSort("fundingRate")}
                >
                  Funding {sortConfig.key === "fundingRate" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
                </th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => handleSort("signal")}
                >
                  Trade Signal {sortConfig.key === "signal" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
                </th>
                <th className="p-2">★</th>
              </tr>
            </thead>

            <tbody>
              {filteredAndSortedData
                .map((item) => {
                  const signal = tradeSignals.find((s) => s.symbol === item.symbol);

                  return (
                    <tr key={item.symbol} className="border-t border-gray-700 hover:bg-gray-800">
                      <td className="p-2 flex items-center gap-2">{item.symbol}</td>

                      <td className={item.priceChangePercent >= 0 ? "text-green-400" : "text-red-400"}>
                        {item.priceChangePercent.toFixed(2)}%
                      </td>

                      <td className="p-2">
                        {formatVolume(item.volume)}
                      </td>

                      <td className={item.fundingRate >= 0 ? "text-green-400" : "text-red-400"}>
                        {(item.fundingRate * 100).toFixed(4)}%
                      </td>

                      <td className="p-2 space-y-1 text-xs text-gray-200">
                        {signal && signal.signal ? (
                          <div className="flex flex-col">
                            <span className={`font-bold ${signal.signal === "long" ? "text-green-400" : "text-red-400"}`}>
                              {signal.signal.toUpperCase()}
                            </span>
                            <span className="text-yellow-300">{signal.strength}</span>
                            <span className="text-gray-400 italic">{signal.confidence}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>

                      <td className="p-2 text-yellow-400 cursor-pointer select-none" onClick={() =>
                        setFavorites((prev) =>
                          prev.includes(item.symbol)
                            ? prev.filter((sym) => sym !== item.symbol)
                            : [...prev, item.symbol]
                        )
                      }>
                        {favorites.includes(item.symbol) ? "★" : "☆"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <p className="text-gray-500 text-xs mt-6">Auto-refreshes every 30 seconds | Powered by Binance API & NewsAPI</p>
      </div>
    </div>
  );
}
