// pages/index.tsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Head from "next/head";
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
  MarketAnalysisResults,
  SentimentSignal,
} from "../types";
import {
  BinanceExchangeInfoResponse,
  BinanceSymbol,
  BinanceTicker24hr,
  BinancePremiumIndex,
} from "../types/binance";
import { analyzeSentiment } from "../utils/sentimentAnalyzer";
import { detectSentimentSignals } from "../utils/signalDetector";
import axios, { AxiosError } from 'axios';

// ... (isAxiosErrorTypeGuard and formatVolume functions remain unchanged)

const BINANCE_API = "https://fapi.binance.com";
const BINANCE_WS_URL = "wss://fstream.binance.com/ws/!forceOrder@arr";

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

  const [flaggedSignals, setFlaggedSignals] = useState<SentimentSignal[]>([]); // This state already exists

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

  // Liquidation data states
  const liquidationEventsRef = useRef<LiquidationEvent[]>([]);
  const [recentLiquidationEvents, setRecentLiquidationEvents] = useState<LiquidationEvent[]>([]);
  const [aggregatedLiquidationForSentiment, setAggregatedLiquidationForSentiment] = useState<
    AggregatedLiquidationData | undefined
  >(undefined);

  // WebSocket specific refs
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

  // Initialize the new property in marketAnalysis state
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResults>({
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    highQualityBreakout: { rating: "", interpretation: "", score: 0 },
    flaggedSignalSentiment: { rating: "", interpretation: "", score: 0 }, // <--- NEW INITIALIZATION
    overallSentimentAccuracy: "",
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
  });

  // ... (generateTradeSignals and aggregateLiquidationEvents remain unchanged)

  // --- WebSocket Connection Function (useCallback for stability) ---
  const connectLiquidationWs = useCallback(() => {
    // ... (This function remains unchanged)
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
        }, 3 * 60 * 1000); // Send ping every 3 minutes (180,000 ms)
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

        const combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
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

        setRawData(combinedData);

        const newFlaggedSignals = detectSentimentSignals(combinedData);
        setFlaggedSignals(newFlaggedSignals); // Ensure this state is updated before sentiment analysis runs

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

      } catch (err: any) {
        console.error("Error fetching initial market data:", err);
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
    const interval = setInterval(fetchAllData, 10000);

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


  // --- Effect to run Sentiment Analysis when market data or liquidation data changes ---
  useEffect(() => {
    if (rawData.length === 0 && !aggregatedLiquidationForSentiment) return;

    const marketStatsForAnalysis: MarketStats = {
      green: greenCount,
      red: redCount,
      fundingStats: {
        greenPositiveFunding: greenPositiveFunding,
        greenNegativeFunding: greenNegativeFunding,
        redPositiveFunding: redPositiveFunding,
        redNegativeFunding: redNegativeFunding,
      },
      volumeData: rawData.map(d => ({
        symbol: d.symbol,
        volume: d.volume,
        priceChange: d.priceChangePercent,
        fundingRate: d.fundingRate,
      })),
      liquidationData: aggregatedLiquidationForSentiment,
      flaggedSignals: flaggedSignals, // <--- Pass the new flaggedSignals data
    };

    const sentimentResults = analyzeSentiment(marketStatsForAnalysis);

    // Update the calculation of averageScore to include the new flaggedSignalSentiment
    const totalScores = [
      sentimentResults.generalBias.score,
      sentimentResults.fundingImbalance.score,
      sentimentResults.shortSqueezeCandidates.score,
      sentimentResults.longTrapCandidates.score,
      sentimentResults.volumeSentiment.score,
      sentimentResults.liquidationHeatmap.score,
      sentimentResults.highQualityBreakout.score,
      sentimentResults.flaggedSignalSentiment.score, // <--- Include in overall score
    ].filter(score => typeof score === 'number' && !isNaN(score));

    const averageScore = totalScores.length > 0 ? totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length : 0;

    let finalOutlookTone = "";
    let strategySuggestion = "";

    if (averageScore >= 8.0) {
      finalOutlookTone = "🟢 Strongly Bullish — The market shows clear bullish momentum and strong setups.";
      strategySuggestion = "Aggressively seek **long opportunities**, especially on strong short squeeze candidates and breakout signals.";
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
      shortSqueezeCandidates: sentimentResults.shortSqueezeCandidates,
      longTrapCandidates: sentimentResults.longTrapCandidates,
      volumeSentiment: sentimentResults.volumeSentiment,
      liquidationHeatmap: sentimentResults.liquidationHeatmap,
      highQualityBreakout: sentimentResults.highQualityBreakout,
      flaggedSignalSentiment: sentimentResults.flaggedSignalSentiment, // <--- Set the new sentiment
      overallSentimentAccuracy: sentimentResults.overallSentimentAccuracy,
      overallMarketOutlook: {
        score: parseFloat(averageScore.toFixed(1)),
        tone: finalOutlookTone,
        strategySuggestion: strategySuggestion,
      },
    });

  }, [
    rawData,
    aggregatedLiquidationForSentiment,
    greenCount, redCount, greenPositiveFunding, greenNegativeFunding, redPositiveFunding, redNegativeFunding,
    flaggedSignals // <--- Add flaggedSignals as a dependency
  ]);

  // ... (handleSort, sortedData, filteredAndSortedData functions remain unchanged)

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

        <div className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-xl font-bold text-white mb-4">
            🚀 Flagged Assets (Quick Checklist)
            <span
              title="Automatically flagged assets based on specific price, volume, and funding criteria for quick assessment."
              className="text-sm text-gray-400 ml-2 cursor-help"
            >
              ℹ️
            </span>
          </h2>

          {flaggedSignals.filter(s => s.signal !== 'Neutral').length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {flaggedSignals
                .filter(s => s.signal === 'Bullish Opportunity')
                .map((s) => (
                  <div key={s.symbol} className="p-3 bg-green-900/40 border border-green-600 rounded-md">
                    <h3 className="font-semibold text-green-300 mb-1">✅ {s.symbol} - {s.signal}</h3>
                    <p className="text-green-100 text-xs">{s.reason}</p>
                  </div>
                ))}
              {flaggedSignals
                .filter(s => s.signal === 'Bearish Risk')
                .map((s) => (
                  <div key={s.symbol} className="p-3 bg-red-900/40 border border-red-600 rounded-md">
                    <h3 className="font-semibold text-red-300 mb-1">❌ {s.symbol} - {s.signal}</h3>
                    <p className="text-red-100 text-xs">{s.reason}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">No strong bullish or bearish signals detected right now based on the checklist criteria.</p>
          )}
        </div>


        <div className="mb-8">
          <LiquidationHeatmap
            liquidationEvents={recentLiquidationEvents}
          />
        </div>

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
                  Signal {sortConfig.key === "signal" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
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

        <p className="text-gray-500 text-xs mt-6">Auto-refreshes every 10 seconds | Powered by Binance API</p>
      </div>
    </div>
  );
}
