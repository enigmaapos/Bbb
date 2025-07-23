// pages/index.tsx (or src/PriceFundingTracker.tsx)

import { useEffect, useState, useCallback, useMemo } from "react";
import Head from "next/head"; // Assuming Next.js, if not, remove this.
import FundingSentimentChart from "../components/FundingSentimentChart";
import MarketAnalysisDisplay from "../components/MarketAnalysisDisplay";
import LeverageProfitCalculator from "../components/LeverageProfitCalculator";
import LiquidationHeatmap from "../components/LiquidationHeatmap";
import {
  SymbolData,
  SymbolTradeSignal,
  MarketStats,
  LiquidationEvent,
  AggregatedLiquidationData,
  MarketAnalysisResults, // Import MarketAnalysisResults
} from ".../types"; // ALL TYPES FROM HERE!
import {
  BinanceExchangeInfoResponse,
  BinanceSymbol,
  BinanceTicker24hr,
  BinancePremiumIndex,
  BinanceOpenInterestHistory,
} from ".../types/binance"; // Import specific Binance API response types
import { analyzeSentiment } from "../utils/sentimentAnalyzer";
import axios from 'axios'; // Import axios for cleaner HTTP requests

const BINANCE_API = "https://fapi.binance.com";

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

export default function PriceFundingTracker() {
  // --- Define threshold constants at the component level ---
  const priceChangeThreshold = 2; // % price change for a basic signal
  const fundingRateThreshold = 0.0001; // 0.01% funding rate for a basic signal
  const highPriceChangeThreshold = 5; // % price change for strong signal
  const highFundingRateThreshold = 0.0003; // 0.03% funding rate for strong signal
  const mediumPriceChangeThreshold = 3; // % price change for medium signal
  const mediumFundingRateThreshold = 0.0002; // 0.02% funding rate for medium signal
  const volumeThreshold = 50_000_000; // 50 million USD volume for higher confidence
  // --- END threshold definitions ---

  const [loading, setLoading] = useState(true); // NEW: Loading state
  const [error, setError] = useState<string | null>(null); // NEW: Error state

  const [data, setData] = useState<SymbolData[]>([]);
  const [tradeSignals, setTradeSignals] = useState<SymbolTradeSignal[]>([]);
  // Individual counts for display, though `marketAnalysis` now holds derived sentiments
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [greenPositiveFunding, setGreenPositiveFunding] = useState(0);
  const [greenNegativeFunding, setGreenNegativeFunding] = useState(0);
  const [redPositiveFunding, setRedPositiveFunding] = useState(0);
  const [redNegativeFunding, setRedNegativeFunding] = useState(0);
  const [priceUpFundingNegativeCount, setPriceUpFundingNegativeCount] = useState(0);
  const [priceDownFundingPositiveCount, setPriceDownFundingPositiveCount] = useState(0);

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

  // --- NEW: Liquidation States ---
  const [recentLiquidationEvents, setRecentLiquidationEvents] = useState<LiquidationEvent[]>([]);
  const [aggregatedLiquidationForSentiment, setAggregatedLiquidationForSentiment] = useState<
    AggregatedLiquidationData | undefined
  >(undefined);
  // --- END NEW LIQUIDATION STATES ---

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

  // --- STATE FOR MARKET ANALYSIS ---
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResults>({ // Use the imported type
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    speculativeInterest: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    momentumImbalance: { rating: "", interpretation: "", score: 0 },
    overallSentimentAccuracy: "",
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
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

  const getSentimentClue = useCallback(() => {
    // This clue will now directly reference the calculated overallMarketOutlook score
    if (marketAnalysis.overallMarketOutlook.score >= 8.0) {
      return "🟢 Bullish Momentum: Look for dips or short squeezes";
    }
    if (marketAnalysis.overallMarketOutlook.score >= 7.0 && marketAnalysis.overallMarketOutlook.score < 8.0) {
      return "🟡 Mixed leaning Bullish: Exercise caution";
    }
    if (marketAnalysis.overallMarketOutlook.score >= 5.0 && marketAnalysis.overallMarketOutlook.score < 7.0) {
      return "↔️ Mixed/Neutral: Focus on scalping";
    }
    if (marketAnalysis.overallMarketOutlook.score < 5.0) {
      return "🔴 Bearish Risk: Caution, longs are trapped";
    }

    return "⚪ Neutral: No clear edge, stay cautious";
  }, [marketAnalysis.overallMarketOutlook.score]);


  // --- NEW: Function to aggregate liquidation events (memoized) ---
  const aggregateLiquidationEvents = useCallback((events: LiquidationEvent[]): AggregatedLiquidationData => {
    let totalLongLiquidationsUSD = 0;
    let totalShortLiquidationsUSD = 0;
    let longLiquidationCount = 0;
    let shortLiquidationCount = 0;

    // Consider a time window for aggregation, e.g., last 5 minutes (300,000 ms)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentEvents = events.filter(e => e.timestamp > fiveMinutesAgo);

    recentEvents.forEach((event) => {
      const volumeUSD = event.price * event.quantity;
      if (event.side === "SELL") {
        // SELL liquidations are long positions closing
        totalLongLiquidationsUSD += volumeUSD;
        longLiquidationCount++;
      } else {
        // BUY liquidations are short positions closing
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
  }, []); // No dependencies, as it operates on the passed events


  // --- Main Data Fetching and WebSocket Logic (Combined useEffect) ---
  useEffect(() => {
    let liquidationWs: WebSocket | null = null; // Declare WebSocket variable

    const fetchAllData = async () => {
      setLoading(true);
      setError(null);
      try {
        const infoRes = await axios.get<BinanceExchangeInfoResponse>(`${BINANCE_API}/fapi/v1/exchangeInfo`);
        const usdtPairs = infoRes.data.symbols
          .filter((s: BinanceSymbol) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: BinanceSymbol) => s.symbol);

        const [tickerRes, fundingRes] = await Promise.all([
          axios.get<BinanceTicker24hr[]>(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          axios.get<BinancePremiumIndex[]>(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const tickerData = tickerRes.data;
        const fundingData = fundingRes.data;

        const openInterestPromises = usdtPairs.map(async (symbol: string) => {
          try {
            const oiRes = await axios.get<BinanceOpenInterestHistory[]>(`${BINANCE_API}/fapi/v1/openInterestHist?symbol=${symbol}&period=5m&limit=1`);
            if (oiRes.data.length > 0) {
              return { symbol, openInterest: parseFloat(oiRes.data[0].sumOpenInterestValue || "0") };
            } else {
              return { symbol, openInterest: 0 };
            }
          } catch (oiError) {
            console.warn(`Failed to fetch Open Interest for ${symbol}:`, oiError);
            return { symbol, openInterest: 0 };
          }
        });
        const allOpenInterestResults = await Promise.all(openInterestPromises);
        const oiMap = new Map<string, number>(allOpenInterestResults.map(item => [item.symbol, item.openInterest]));

        const combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t) => t.symbol === symbol);
          const funding = fundingData.find((f) => f.symbol === symbol);
          const lastPrice = parseFloat(ticker?.lastPrice || "0");
          const volume = parseFloat(ticker?.quoteVolume || "0");
          const openInterest = oiMap.get(symbol) || 0;
          const dummyRsi = parseFloat(((Math.random() * 60) + 20).toFixed(2)); // RSI between 20 and 80 for demo

          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: lastPrice,
            volume: volume,
            openInterest: openInterest,
            rsi: dummyRsi,
          };
        }).filter((d: SymbolData) => d.volume > 0);

        setData(combinedData);

        // Update counts for stats
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

        const topShortSqueeze = combinedData
          .filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0)
          .sort((a, b) => a.fundingRate - b.fundingRate)
          .slice(0, 5);

        const topLongTrap = combinedData
          .filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0)
          .sort((a, b) => b.fundingRate - a.fundingRate)
          .slice(0, 5);

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

        // Sorting logic (can be memoized or kept here)
        const sorted = [...combinedData].sort((a, b) => {
          const { key, direction } = sortConfig;
          if (!key) return 0;

          const order = direction === "asc" ? 1 : -1;

          if (key === "signal") {
            const signalA = signals.find((s) => s.symbol === a.symbol);
            const signalB = signals.find((s) => s.symbol === b.symbol);

            const rank = (s: SymbolTradeSignal | undefined) => {
              if (s?.signal === "long") return 0;
              if (s?.signal === "short") return 1;
              return 2;
            };

            const rankA = rank(signalA);
            const rankB = rank(signalB);

            return (rankA - rankB) * order;
          } else if (key === "fundingRate") {
            return (a.fundingRate - b.fundingRate) * order;
          } else if (key === "priceChangePercent") {
            return (a.priceChangePercent - b.priceChangePercent) * order;
          }
          return 0;
        });

        setData(sorted);

      } catch (err: any) {
        console.error("Error fetching initial market data:", err);
        setError("Failed to fetch initial market data.");
      } finally {
        setLoading(false);
      }
    };

    // WebSocket for Liquidations
    let reconnectTimeout: NodeJS.Timeout | null = null;
    const connectLiquidationWs = () => {
      if (liquidationWs) {
        liquidationWs.close(); // Close existing connection before trying to reconnect
      }

      liquidationWs = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
      console.log("Attempting to connect to Liquidation WS...");

      liquidationWs.onopen = () => {
        console.log("Liquidation WS connected");
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      liquidationWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            const newEvts: LiquidationEvent[] = data.map((o: any) => ({
              symbol: o.o.s as string,
              side: o.o.S as "BUY" | "SELL",
              price: parseFloat(o.o.p),
              quantity: parseFloat(o.o.q),
              timestamp: o.E as number,
            }));

            setRecentLiquidationEvents((prev) => {
              const updatedEvents = [...newEvts, ...prev].slice(0, 500); // Keep last 500 events for heatmap
              // Aggregate *all* recent events within the time window for sentiment analysis
              const aggregated = aggregateLiquidationEvents(updatedEvents);
              setAggregatedLiquidationForSentiment(aggregated);
              return updatedEvents;
            });
          }
        } catch (e) {
          console.error("Failed to parse liquidation WS message:", e);
        }
      };

      liquidationWs.onclose = (event) => {
        console.warn("Liquidation WS closed:", event.code, event.reason);
        // Attempt to reconnect after a delay
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            console.log("Reconnecting Liquidation WS...");
            connectLiquidationWs();
          }, 5000); // Try to reconnect after 5 seconds
        }
      };

      liquidationWs.onerror = (err) => {
        console.error("Liquidation WS error:", err);
        liquidationWs?.close(); // Force close to trigger onclose and reconnection attempt
      };
    };

    connectLiquidationWs(); // Initial connection

    // Initial fetch and then set interval for periodic refresh of REST data
    fetchAllData();
    const interval = setInterval(fetchAllData, 10000); // Refresh every 10 seconds

    // Cleanup function for WebSockets and Interval
    return () => {
      clearInterval(interval);
      if (liquidationWs) {
        liquidationWs.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [sortConfig, generateTradeSignals, aggregateLiquidationEvents]); // Added aggregateLiquidationEvents to dependencies

  // --- Effect to run Sentiment Analysis when market data or liquidation data changes ---
  useEffect(() => {
    // Only run analysis if we have initial data
    if (data.length === 0 && !aggregatedLiquidationForSentiment) return;

    // Prepare data for sentiment analyzer
    const marketStatsForAnalysis: MarketStats = {
      green: greenCount,
      red: redCount,
      fundingStats: {
        greenFundingPositive: greenPositiveFunding,
        greenNegativeFunding: greenNegativeFunding,
        redPositiveFunding: redPositiveFunding,
        redNegativeFunding: redNegativeFunding,
      },
      volumeData: data.map(d => ({
        symbol: d.symbol,
        volume: d.volume,
        priceChange: d.priceChangePercent,
        fundingRate: d.fundingRate,
        rsi: d.rsi,
        openInterest: d.openInterest,
      })),
      liquidationData: aggregatedLiquidationForSentiment, // Pass the aggregated liquidation data here
    };

    const sentimentResults = analyzeSentiment(marketStatsForAnalysis);

    // Adjusted Final Market Outlook Score Logic - INCLUDE NEW SCORES
    const totalScores = [
      sentimentResults.generalBias.score,
      sentimentResults.fundingImbalance.score,
      sentimentResults.shortSqueezeCandidates.score,
      sentimentResults.longTrapCandidates.score,
      sentimentResults.volumeSentiment.score,
      sentimentResults.speculativeInterest.score,
      sentimentResults.momentumImbalance.score,
      sentimentResults.liquidationHeatmap.score, // NEW: Include liquidation heatmap score
    ].filter(score => typeof score === 'number' && !isNaN(score));

    const averageScore = totalScores.length > 0 ? totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length : 0;

    let finalOutlookTone = "";
    let strategySuggestion = "";

    if (averageScore >= 8.0) {
      finalOutlookTone = "🟢 Strongly Bullish — The market shows clear bullish momentum and strong setups.";
      strategySuggestion = "Aggressively seek **long opportunities**, especially on strong short squeeze candidates.";
    } else if (averageScore >= 7.0) {
      finalOutlookTone = "🟡 Mixed leaning Bullish — Some bullish momentum exists, but caution is advised due to underlying risks.";
      strategySuggestion = "Look for **long opportunities** on high-conviction setups, but be prepared for volatility and consider tighter stop losses.";
    } else if (averageScore >= 5.0) {
      finalOutlookTone = "↔️ Mixed/Neutral — The market lacks a clear direction, with both bullish and bearish elements.";
      strategySuggestion = "Focus on **scalping** or **range trading** specific high-volume symbols. Avoid strong directional bets until clarity emerges.";
    } else {
      finalOutlookTone = "🔻 Bearish — The market is under heavy selling pressure. Longs are trapped, and few bullish setups exist.";
      strategySuggestion = "Consider **shorting opportunities** on long trap candidates, or **staying on the sidelines**. Exercise extreme caution with long positions.";
    }

    setMarketAnalysis({
      generalBias: sentimentResults.generalBias,
      fundingImbalance: sentimentResults.fundingImbalance,
      shortSqueezeCandidates: sentimentResults.shortSqueezeCandidates, // Use correct key
      longTrapCandidates: sentimentResults.longTrapCandidates,         // Use correct key
      volumeSentiment: sentimentResults.volumeSentiment,
      speculativeInterest: sentimentResults.speculativeInterest,
      liquidationHeatmap: sentimentResults.liquidationHeatmap,
      momentumImbalance: sentimentResults.momentumImbalance,
      overallSentimentAccuracy: sentimentResults.overallSentimentAccuracy,
      overallMarketOutlook: {
        score: parseFloat(averageScore.toFixed(1)),
        tone: finalOutlookTone,
        strategySuggestion: strategySuggestion,
      },
    });

  }, [
    data, // Data updated from REST API fetch
    aggregatedLiquidationForSentiment, // NEW: Liquidation data from WS
    greenCount, redCount, greenPositiveFunding, greenNegativeFunding, redPositiveFunding, redNegativeFunding
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

  const filteredData = useMemo(() => { // Memoize filtered data for performance
    return data.filter((item) => {
      return (
        (!searchTerm || item.symbol.includes(searchTerm)) &&
        (!showFavoritesOnly || favorites.includes(item.symbol))
      );
    });
  }, [data, searchTerm, showFavoritesOnly, favorites]);


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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <Head>
        <title>Binance USDT Perpetual Tracker</title>
        <meta name="description" content="Real-time Binance USDT Perpetual Tracker with Sentiment Analysis and Liquidation Data" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-blue-400">📈 Binance USDT Perpetual Tracker</h1>

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
                  data.filter((item) => item.priceChangePercent >= 5).length
                }</li>
                <li><span className="font-semibold text-yellow-300">Mild Movement (±0–5%)</span>: {
                  data.filter((item) => item.priceChangePercent > -5 && item.priceChangePercent < 5).length
                }</li>
                <li><span className="font-semibold text-red-400">Price Drop (≤ -5%)</span>: {
                  data.filter((item) => item.priceChangePercent <= -5).length
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

        <p className="text-white text-sm font-bold mb-2">
          🌐 Overall Sentiment:{" "}
          <span
            className={
              getSentimentClue().includes("🟢")
                ? "text-green-400"
                : getSentimentClue().includes("🔴")
                ? "text-red-400"
                : getSentimentClue().includes("🟡")
                ? "text-yellow-300"
                : getSentimentClue().includes("↔️")
                ? "text-blue-400"
                : "text-gray-400"
            }
          >
            {getSentimentClue()}
          </span>
        </p>

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

        {/* --- MarketAnalysisDisplay COMPONENT --- */}
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
        {/* --- END MarketAnalysisDisplay COMPONENT --- */}

        <FundingSentimentChart
          greenPositiveFunding={greenPositiveFunding}
          greenNegativeFunding={greenNegativeFunding}
          redPositiveFunding={redPositiveFunding}
          redNegativeFunding={redNegativeFunding}
        />

        <div className="my-8 h-px bg-gray-700" /> {/* Separator */}

        <div className="mb-8">
          <LeverageProfitCalculator />
        </div>

        {/* NEW: Liquidation Heatmap component integration */}
        <div className="mb-8">
          <LiquidationHeatmap
            liquidationEvents={recentLiquidationEvents} // Pass recent events to heatmap
          />
        </div>
        {/* END NEW COMPONENT INTEGRATION */}

        <div className="my-8 h-px bg-gray-700" /> {/* Separator */}

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


        {/* --- UPDATED TABLE STRUCTURE (Removed Entry/SL/TP columns) --- */}
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
                <th className="p-2">OI Value (USD)</th> {/* NEW COLUMN */}
                <th className="p-2">RSI (Dummy)</th> {/* NEW COLUMN */}
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => handleSort("signal")}
                >
                  Signal {sortConfig.key === "signal" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
                </th>
                <th className="p-2">★</th>
              </tr>
            </thead>

            <tbody>
              {filteredData // Use filteredData here
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

                      <td className="p-2">
                        {formatVolume(item.openInterest || 0)} {/* Display OI */}
                      </td>
                      <td className="p-2">
                        {item.rsi ? item.rsi.toFixed(2) : 'N/A'} {/* Display RSI */}
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
        {/* --- END UPDATED TABLE STRUCTURE --- */}

        <p className="text-gray-500 text-xs mt-6">Auto-refreshes every 10 seconds | Powered by Binance API</p>
      </div>
    </div>
  );
}
