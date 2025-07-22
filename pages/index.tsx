// pages/index.tsx or src/PriceFundingTracker.tsx

import { useEffect, useState, useCallback } from "react";
import FundingSentimentChart from "../components/FundingSentimentChart";
import MarketAnalysisDisplay from "../components/MarketAnalysisDisplay";
import LeverageProfitCalculator from "../components/LeverageProfitCalculator";
import LiquidationHeatmap from "../components/LiquidationHeatmap"; // <--- NEW: Import LiquidationHeatmap
import { SymbolData, SymbolTradeSignal } from "../types";
import { analyzeSentiment, MarketStats } from "../utils/sentimentAnalyzer";

const BINANCE_API = "https://fapi.binance.com";
// Removed BINANCE_API_V2 as it was causing confusion for the OI endpoint

// Helper function to format large numbers with M, B, T suffixes
const formatVolume = (num: number): string => {
  if (num === 0) return "0";
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1, // Adjust as needed for precision
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

  const [data, setData] = useState<SymbolData[]>([]);
  const [tradeSignals, setTradeSignals] = useState<SymbolTradeSignal[]>([]);
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
  const [marketAnalysis, setMarketAnalysis] = useState({
    generalBias: {
      rating: "",
      interpretation: "",
      score: 0,
    },
    fundingImbalance: {
      rating: "",
      interpretation: "",
      score: 0,
    },
    shortSqueezeCandidates: {
      rating: "",
      interpretation: "",
      score: 0,
    },
    longTrapCandidates: {
      rating: "",
      interpretation: "",
      score: 0,
    },
    volumeSentiment: {
      rating: "",
      interpretation: "",
      score: 0,
    },
    speculativeInterest: { // NEW: Add Speculative Interest (OI)
      rating: "",
      interpretation: "",
      score: 0,
    },
    liquidationHeatmap: { // NEW: Add Liquidation Heatmap (Placeholder for now)
      rating: "",
      interpretation: "",
      score: 0,
    },
    momentumImbalance: { // NEW: Add Momentum Imbalance (RSI)
      rating: "",
      interpretation: "",
      score: 0,
    },
    overallSentimentAccuracy: "",
    overallMarketOutlook: {
      score: 0,
      tone: "",
      strategySuggestion: "",
    },
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


  useEffect(() => {
    const fetchAll = async () => {
      try {
        const infoRes = await fetch(`${BINANCE_API}/fapi/v1/exchangeInfo`);
        if (!infoRes.ok) throw new Error(`Binance exchangeInfo API error: ${infoRes.status}`);
        const infoData = await infoRes.json();
        const usdtPairs = infoData.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        // --- Fetch Ticker and Funding Data ---
        // These can be fetched in parallel as they support fetching all symbols or are distinct endpoints
        const [tickerRes, fundingRes] = await Promise.all([
          fetch(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          fetch(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        if (!tickerRes.ok) console.error("Error fetching ticker data:", await tickerRes.text());
        if (!fundingRes.ok) console.error("Error fetching funding data:", await fundingRes.text());

        const tickerData = await tickerRes.json();
        const fundingData = await fundingRes.json();

        // --- Fetch Open Interest History for each symbol individually ---
        // This endpoint requires a separate request for each symbol.
        const openInterestPromises = usdtPairs.map(async (symbol: string) => {
            try {
                // Corrected endpoint path: /fapi/v1/openInterestHist
                // Correct usage: Pass 'symbol' parameter for individual symbol
                const oiUrl = `${BINANCE_API}/fapi/v1/openInterestHist?symbol=${symbol}&period=5m&limit=1`;
                const oiRes = await fetch(oiUrl);

                if (!oiRes.ok) {
                    // Log a warning for individual symbol failures but don't halt the whole process
                    console.warn(`Failed to fetch Open Interest for ${symbol}: ${oiRes.status} ${oiRes.statusText}`);
                    return { symbol, openInterest: 0 }; // Return default value for this symbol
                }
                const oiData = await oiRes.json();

                // Binance's openInterestHist returns an array, the latest data is usually the first element.
                // We're interested in 'sumOpenInterestValue' for USD value.
                if (oiData.length > 0) {
                    return { symbol, openInterest: parseFloat(oiData[0].sumOpenInterestValue || "0") };
                } else {
                    return { symbol, openInterest: 0 }; // No data found for this symbol
                }
            } catch (oiError) {
                console.error(`Error fetching Open Interest for ${symbol}:`, oiError);
                return { symbol, openInterest: 0 }; // Return default on network/parsing error
            }
        });

        // Wait for all individual Open Interest fetches to complete
        const allOpenInterestResults = await Promise.all(openInterestPromises);
        const oiMap = new Map<string, number>();
        allOpenInterestResults.forEach(item => {
            if (item) { // Ensure the item is not null/undefined from a failed fetch
                oiMap.set(item.symbol, item.openInterest);
            }
        });

        // 4. Combine all fetched data
        const combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t: any) => t.symbol === symbol);
          const funding = fundingData.find((f: any) => f.symbol === symbol);
          const lastPrice = parseFloat(ticker?.lastPrice || "0");
          const volume = parseFloat(ticker?.quoteVolume || "0");
          const openInterest = oiMap.get(symbol) || 0; // Get OI from map, default to 0 if not found

          // Placeholder for RSI - In a real app, you'd fetch klines and calculate RSI
          const dummyRsi = (Math.random() * 60) + 20; // RSI between 20 and 80 for demo

          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: lastPrice,
            volume: volume,
            openInterest: openInterest, // Include Open Interest
            rsi: dummyRsi, // Include RSI (dummy for now)
            // marketCap: <fetch_or_calculate_market_cap_here>,
            // liquidationVolume: <fetch_liquidation_data_here>,
          };
        }).filter((d: SymbolData) => d.volume > 0); // Filter out symbols with no volume (likely inactive)


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

        // Calculate funding imbalance data
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

        // --- PREPARE DATA FOR SENTIMENT ANALYZER ---
        const marketStatsForAnalysis: MarketStats = {
          green: green,
          red: red,
          fundingStats: {
            greenFundingPositive: gPos,
            greenFundingNegative: gNeg,
            redFundingPositive: rPos,
            redFundingNegative: rNeg,
          },
          volumeData: combinedData.map(d => ({
            symbol: d.symbol,
            volume: d.volume,
            priceChange: d.priceChangePercent,
            fundingRate: d.fundingRate,
            rsi: d.rsi, // Pass RSI
            openInterest: d.openInterest, // Pass Open Interest
            // marketCap: d.marketCap,
            // liquidationVolume: d.liquidationVolume,
          })),
        };

        const sentimentResults = analyzeSentiment(marketStatsForAnalysis);


        // --- Update Market Analysis State with results from sentiment analyzer ---
        const generalBiasScore = sentimentResults.generalBias.score;
        const fundingImbalanceScore = sentimentResults.fundingImbalance.score;
        const shortSqueezeScore = sentimentResults.shortSqueeze.score;
        const longTrapScore = sentimentResults.longTrap.score;
        const volumeSentimentScore = sentimentResults.volumeSentiment.score;
        const speculativeInterestScore = sentimentResults.speculativeInterest.score;
        const momentumImbalanceScore = sentimentResults.momentumImbalance.score;
        // const liquidationHeatmapScore = sentimentResults.liquidationHeatmap.score;
        // const breakoutVolumeScore = sentimentResults.breakoutVolume.score;


        // Adjusted Final Market Outlook Score Logic - INCLUDE NEW SCORES
        const totalScores = [
            generalBiasScore,
            fundingImbalanceScore,
            shortSqueezeScore,
            longTrapScore,
            volumeSentimentScore,
            speculativeInterestScore,
            momentumImbalanceScore
            // Add other new scores here as they are implemented
        ].filter(score => typeof score === 'number' && !isNaN(score)); // Filter out any non-numeric scores

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
            shortSqueezeCandidates: sentimentResults.shortSqueeze,
            longTrapCandidates: sentimentResults.longTrap,
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


      } catch (err: any) {
        console.error("General error fetching Binance data:", err);
      }
      // Removed the finally block because there was no loading state managed in this component.
      // If you add a loading state, add `setLoading(false);` in a finally block.
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [
    sortConfig,
    generateTradeSignals,
    // The following dependencies are probably not necessary for useEffect
    // if their values are only used inside fetchAllData, which is re-created
    // if these change. However, however, keep them if they are truly used outside fetchAll.
    // greenCount, redCount, priceUpFundingNegativeCount, priceDownFundingPositiveCount,
    // greenNegativeFunding, redPositiveFunding, priceChangeThreshold, fundingRateThreshold,
    // highPriceChangeThreshold, highFundingRateThreshold, mediumPriceChangeThreshold,
    // mediumFundingRateThreshold, volumeThreshold, getSentimentClue,
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

  const filteredData = data.filter((item) => {
    return (
      (!searchTerm || item.symbol.includes(searchTerm)) &&
      (!showFavoritesOnly || favorites.includes(item.symbol))
    );
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📈 Binance USDT Perpetual Tracker</h1>

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

        {/* --- USE THE NEW MarketAnalysisDisplay COMPONENT HERE --- */}
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
        {/* --- END NEW COMPONENT USAGE --- */}

        <FundingSentimentChart
          greenPositiveFunding={greenPositiveFunding}
          greenNegativeFunding={greenNegativeFunding}
          redPositiveFunding={redPositiveFunding}
          redNegativeFunding={redNegativeFunding}
        />

        ---

        <div className="mb-8">
          <LeverageProfitCalculator />
        </div>

        {/* NEW: Liquidation Heatmap component integration */}
        <div className="mb-8">
          <LiquidationHeatmap />
        </div>
        {/* END NEW COMPONENT INTEGRATION */}

        ---

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
