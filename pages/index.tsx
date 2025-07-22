// src/PriceFundingTracker.tsx (or just PriceFundingTracker.tsx)

import { useEffect, useState } from "react";
import FundingSentimentChart from "./components/FundingSentimentChart";
import MarketAnalysisDisplay from "./components/MarketAnalysisDisplay";
import { SymbolData, SymbolTradeSignal } from "./types"; // <-- UPDATED IMPORT

const BINANCE_API = "https://fapi.binance.com";


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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

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
    overallSentimentAccuracy: "",
    overallMarketOutlook: {
      score: 0,
      tone: "",
      strategySuggestion: "",
    },
  });

  const generateTradeSignals = (combinedData: SymbolData[]): SymbolTradeSignal[] => {
    return combinedData.map(({ symbol, priceChangePercent, fundingRate, lastPrice }) => {
      let signal: "long" | "short" | null = null;
      let entry: number | null = null;
      let stopLoss: number | null = null;
      let takeProfit: number | null = null;

      if (priceChangePercent >= 0 && fundingRate < 0) {
        signal = "long";
        entry = lastPrice;
        stopLoss = entry * 0.99;
        takeProfit = entry * 1.02;
      }

      if (priceChangePercent < 0 && fundingRate > 0) {
        signal = "short";
        entry = lastPrice;
        stopLoss = entry * 1.01;
        takeProfit = entry * 0.98;
      }

      return { symbol, entry, stopLoss, takeProfit, signal };
    });
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const infoRes = await fetch(`${BINANCE_API}/fapi/v1/exchangeInfo`);
        if (!infoRes.ok) throw new Error(`Binance exchangeInfo API error: ${infoRes.status}`);
        const infoData = await infoRes.json();
        const usdtPairs = infoData.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        const [tickerRes, fundingRes] = await Promise.all([
          fetch(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          fetch(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        if (!tickerRes.ok) console.error("Error fetching ticker data:", await tickerRes.text());
        if (!fundingRes.ok) console.error("Error fetching funding data:", await fundingRes.text());

        const tickerData = await tickerRes.json();
        const fundingData = await fundingRes.json();

        const combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t: any) => t.symbol === symbol);
          const funding = fundingData.find((f: any) => f.symbol === symbol);
          const lastPrice = parseFloat(ticker?.lastPrice || "0");
          const volume = parseFloat(ticker?.quoteVolume || "0");

          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: lastPrice,
            volume: volume,
          };
        });

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
          .sort((a, b) => a.fundingRate - b.fundingRate) // Sort by most negative funding
          .slice(0, 5);

        const topLongTrap = combinedData
          .filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0)
          .sort((a, b) => b.fundingRate - a.fundingRate) // Sort by most positive funding
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
              return 2; // No signal
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

        // --- PERFORM MARKET ANALYSIS ---
        const totalCoins = combinedData.length;

        // General Market Bias
        const priceIncrease5Plus = combinedData.filter((item) => item.priceChangePercent >= 5).length;
        const mildMovement = combinedData.filter((item) => item.priceChangePercent > -5 && item.priceChangePercent < 5).length;
        const priceDrop5Minus = combinedData.filter((item) => item.priceChangePercent <= -5).length;

        let generalBiasInterpretation = "";
        let generalBiasRating = "";
        let generalBiasScore = 0;

        const greenRatio = green / totalCoins;
        const redRatio = red / totalCoins;

        if (redRatio > 0.75) {
            generalBiasInterpretation = `The market is dominated by red candles, and most coins are either flat or down. Over ${Math.round(redRatio * 100)}% of the market is bearish or stagnant.`;
            generalBiasRating = "🔴 Strong Bearish Bias";
            generalBiasScore = 8.5;
        } else if (greenRatio > 0.6) {
            generalBiasInterpretation = `The market shows strong bullish momentum, with a majority of coins in the green.`;
            generalBiasRating = "🟢 Strong Bullish Bias";
            generalBiasScore = 8.0;
        } else if (Math.abs(greenRatio - redRatio) < 0.2) {
            generalBiasInterpretation = `The market is mixed, with a relatively even split between green and red coins, indicating indecision.`;
            generalBiasRating = "🟡 Mixed Bias";
            generalBiasScore = 5.0;
        } else {
            generalBiasInterpretation = `The market shows a slight bias, but no strong overall trend is dominant.`;
            generalBiasRating = "⚪ Neutral Bias";
            generalBiasScore = 6.0;
        }

        // Funding Sentiment Imbalance
        let fundingImbalanceInterpretation = "";
        let fundingImbalanceRating = "";
        let fundingImbalanceScore = 0;

        if (rPos > gNeg * 2 && rPos > 100) { // If red positive is significantly higher than green negative
            fundingImbalanceInterpretation = "In the red group, longs are massively funding shorts while price is falling → trapped bulls. Green group shows small bullish squeeze potential, but it’s too small to shift momentum.";
            fundingImbalanceRating = "🔴 Bearish Trap Dominance";
            fundingImbalanceScore = 9.0;
        } else if (gNeg > rPos * 2 && gNeg > 50) {
            fundingImbalanceInterpretation = "In the green group, shorts are heavily funding longs while price is rising → strong short squeeze potential. Red group shows limited long trap risk.";
            fundingImbalanceRating = "🟢 Bullish Squeeze Dominance";
            fundingImbalanceScore = 8.5;
        } else {
            fundingImbalanceInterpretation = "Funding sentiment is relatively balanced or shows no extreme imbalance, suggesting a less clear directional bias from funding.";
            fundingImbalanceRating = "⚪ Balanced Funding";
            fundingImbalanceScore = 5.0;
        }

        // Top Short Squeeze Candidates
        let shortSqueezeRating = "";
        let shortSqueezeInterpretation = "";
        let shortSqueezeScore = 0;

        if (topShortSqueeze.length > 0) {
            const hasHighVolumeChange = topShortSqueeze.some(d => d.volume > 100_000_000 && d.priceChangePercent > 5); // Example criteria
            if (topShortSqueeze.length >= 3 && hasHighVolumeChange) {
                shortSqueezeInterpretation = "These coins show strong potential for short squeezes (shorts paying while price rises). The presence of high volume and significant price increases indicates a more impactful squeeze.";
                shortSqueezeRating = "🟢 Strong Bullish Pockets";
                shortSqueezeScore = 8.0;
            } else {
                shortSqueezeInterpretation = "These coins show potential short squeezes (shorts paying while price rises), but they might be isolated or lack significant volume/price movement to drive broader momentum.";
                shortSqueezeRating = "🟢 Bullish Pockets (Isolated)";
                shortSqueezeScore = 6.5;
            }
        } else {
            shortSqueezeInterpretation = "No strong short squeeze candidates identified at this moment. The market lacks significant price increases accompanied by negative funding rates.";
            shortSqueezeRating = "⚪ No Squeeze Candidates";
            shortSqueezeScore = 4.0;
        }

        // Top Long Trap Candidates
        let longTrapRating = "";
        let longTrapInterpretation = "";
        let longTrapScore = 0;

        if (topLongTrap.length > 0) {
            const hasHighVolumeDrop = topLongTrap.some(d => d.volume > 100_000_000 && d.priceChangePercent < -5); // Example criteria
            if (topLongTrap.length >= 3 && hasHighVolumeDrop) {
                longTrapInterpretation = "These coins show clear bear momentum with positive funding, meaning longs are heavily trapped. The combination of significant price drops and high volume makes them classic liquidation magnets and indicates deeper sell-off risk.";
                longTrapRating = "🔴 High Risk (Severe Long Trap)";
                longTrapScore = 9.5;
            } else {
                longTrapInterpretation = "These coins show clear bear momentum with positive funding, meaning longs are trapped. While present, they might be isolated or have lower volume/less extreme price drops, indicating moderate risk.";
                longTrapRating = "🔴 High Risk (Moderate Long Trap)";
                longTrapScore = 7.5;
            }
        } else {
            longTrapInterpretation = "No strong long trap candidates identified at this moment. The market is not showing significant price drops accompanied by positive funding rates, which is a positive sign for longs.";
            longTrapRating = "⚪ No Trap Candidates";
            longTrapScore = 4.0;
        }

        // Overall Sentiment Accuracy
        let overallSentimentAccuracy = "";
        const currentSentimentClue = getSentimentClue(); // Call getSentimentClue with current counts
        if (currentSentimentClue.includes("🔴 Bearish Risk") && rPos > gNeg) {
            overallSentimentAccuracy = "✅ Correct. The sentiment accurately reflects the dominance of trapped longs in a falling market.";
        } else if (currentSentimentClue.includes("🟢 Bullish Momentum") && gNeg > rPos) {
            overallSentimentAccuracy = "✅ Correct. The sentiment accurately reflects potential short squeezes in a rising market.";
        } else if (currentSentimentClue.includes("🟡 Mixed Signals") && priceUpFundingNegative > 5 && priceDownFundingPositive > 5) {
            overallSentimentAccuracy = "✅ Correct. The sentiment accurately reflects a mixed market with both bullish and bearish divergence.";
        } else {
            overallSentimentAccuracy = "💡 Neutral. The sentiment is currently neutral, awaiting clearer market direction.";
        }

        // Final Market Outlook Score
        const averageScore = (generalBiasScore + fundingImbalanceScore + shortSqueezeScore + longTrapScore) / 4;
        let finalOutlookTone = "";
        let strategySuggestion = "";

        if (averageScore >= 8) {
            finalOutlookTone = "🔻 Bearish — The market is under heavy selling pressure. Longs are trapped, and few bullish setups exist.";
            strategySuggestion = "Consider **shorting opportunities** on long trap candidates, or **staying on the sidelines**. Exercise extreme caution with long positions.";
        } else if (averageScore >= 7) {
            finalOutlookTone = "🔺 Bullish — The market shows overall bullish momentum with potential for short squeezes.";
            strategySuggestion = "Look for **long opportunities** on short squeeze candidates or **buy the dip** on strong coins.";
        } else if (averageScore >= 6) {
            finalOutlookTone = "↔️ Mixed/Neutral — The market lacks a clear direction, with both bullish and bearish elements.";
            strategySuggestion = "Focus on **scalping** or **range trading** specific high-volume symbols. Avoid strong directional bets.";
        } else {
            finalOutlookTone = "⚪ Indecisive — The market is highly uncertain. Very low scores suggest a lack of clear signals.";
            strategySuggestion = "Best to **wait for clearer signals**. Avoid trading until a clearer trend emerges.";
        }


        setMarketAnalysis({
            generalBias: {
                rating: generalBiasRating,
                interpretation: generalBiasInterpretation,
                score: generalBiasScore,
            },
            fundingImbalance: {
                rating: fundingImbalanceRating,
                interpretation: fundingImbalanceInterpretation,
                score: fundingImbalanceScore,
            },
            shortSqueezeCandidates: {
                rating: shortSqueezeRating,
                interpretation: shortSqueezeInterpretation,
                score: shortSqueezeScore,
            },
            longTrapCandidates: {
                rating: longTrapRating,
                interpretation: longTrapInterpretation,
                score: longTrapScore,
            },
            overallSentimentAccuracy: overallSentimentAccuracy,
            overallMarketOutlook: {
                score: parseFloat(averageScore.toFixed(1)),
                tone: finalOutlookTone,
                strategySuggestion: strategySuggestion,
            },
        });


      } catch (err) {
        console.error("General error fetching Binance data:", err);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [sortConfig, greenCount, redCount, priceUpFundingNegativeCount, priceDownFundingPositiveCount, greenNegativeFunding, redPositiveFunding]);

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
          direction = "asc";
        }
      }
      return { key, direction };
    });
  };

  const getSentimentClue = () => {
    const total = greenCount + redCount;
    if (total === 0) return "⚪ Neutral: No clear edge, stay cautious";

    const greenRatio = greenCount / total;
    const redRatio = redCount / total;

    if (greenRatio > 0.7 && priceUpFundingNegativeCount > 10) {
      return "🟢 Bullish Momentum: Look for dips or short squeezes";
    }

    if (redRatio > 0.6 && priceDownFundingPositiveCount > 15) {
      return "🔴 Bearish Risk: Caution, longs are trapped and funding still positive";
    }

    if (greenNegativeFunding > 10) {
      return "🟢 Hidden Strength: Price is up but shorts are paying → squeeze potential";
    }

    if (redPositiveFunding > 20) {
      return "🔴 Bearish Breakdown: Price down but longs still funding → more pain likely";
    }

    if (priceUpFundingNegativeCount > 5 && priceDownFundingPositiveCount > 5) {
      return "🟡 Mixed Signals: Both sides trapped → choppy market expected";
    }

    return "⚪ Neutral: No clear edge, stay cautious";
  };

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

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="🔍 Search symbol (e.g. BTCUSDT)"
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

        <FundingSentimentChart
          greenPositiveFunding={greenPositiveFunding}
          greenNegativeFunding={greenNegativeFunding}
          redPositiveFunding={redPositiveFunding}
          redNegativeFunding={redNegativeFunding}
        />

        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs sticky top-0">
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
                <th className="p-2">Entry</th>
                <th className="p-2">Stop Loss</th>
                <th className="p-2">Take Profit</th>
                <th className="p-2">★</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter(
                  (item) => {
                    return (
                      (!searchTerm || item.symbol.includes(searchTerm)) &&
                      (!showFavoritesOnly || favorites.includes(item.symbol))
                    );
                  }
                )
                .map((item) => {
                  const signal = tradeSignals.find((s) => s.symbol === item.symbol);
                  return (
                    <tr key={item.symbol} className="border-t border-gray-700 hover:bg-gray-800">
                      <td className="p-2 flex items-center gap-2">
                        {item.symbol}
                      </td>
                      <td className={item.priceChangePercent >= 0 ? "text-green-400" : "text-red-400"}>
                        {item.priceChangePercent.toFixed(2)}%
                      </td>
                      <td className="p-2">
                        {formatVolume(item.volume)}
                      </td>
                      <td className={item.fundingRate >= 0 ? "text-green-400" : "text-red-400"}>
                        {(item.fundingRate * 100).toFixed(4)}%
                      </td>

                      <td className={`p-2 font-semibold ${
                        signal?.signal === "long"
                          ? "text-green-400"
                          : signal?.signal === "short"
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}>
                        {signal?.signal ? signal.signal.toUpperCase() : "-"}
                      </td>

                      <td className="p-2">
                        {signal && signal.entry !== null ? signal.entry.toFixed(4) : "-"}
                      </td>

                      <td className="p-2">
                        {signal && signal.stopLoss !== null ? signal.stopLoss.toFixed(4) : "-"}
                      </td>

                      <td className="p-2">
                        {signal && signal.takeProfit !== null ? signal.takeProfit.toFixed(4) : "-"}
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
