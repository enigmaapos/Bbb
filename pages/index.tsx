import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Cell,
} from "recharts";

const BINANCE_API = "https://fapi.binance.com";

type SRStatus = "above_resistance" | "at_resistance" | "between" | "at_support" | "below_support" | "unknown";

type SymbolData = {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  // Added for conceptual S/R integration
  majorResistance?: number;
  majorSupport?: number;
  srStatus?: SRStatus;
};

type SymbolTradeSignal = {
  symbol: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  signal: "long" | "short" | null;
  // Added to store signal validity based on S/R
  isValidatedBySR?: boolean;
  srReason?: string;
};

// Custom Tooltip component to match dark theme
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 p-2 rounded shadow-lg text-white text-xs">
        <p className="font-bold mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {`${entry.name}: ${entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
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
  const [sortBy, setSortBy] = useState<"fundingRate" | "priceChangePercent">("fundingRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBySignal, setSortBySignal] = useState<"asc" | "desc" | null>(null);

  // New state for funding imbalance data
  const [fundingImbalanceData, setFundingImbalanceData] = useState({
    priceUpShortsPaying: 0,
    priceUpLongsPaying: 0,
    priceDownLongsPaying: 0,
    priceDownShortsPaying: 0,
    topShortSqueeze: [] as SymbolData[],
    topLongTrap: [] as SymbolData[],
  });

  // --- MOCK FUNCTION FOR SUPPORT/RESISTANCE ---
  // In a real application, this would involve fetching historical klines
  // and running a complex algorithm to identify actual S/R levels.
  // For this example, it's just a placeholder for demonstration.
  const getMockSupportResistanceStatus = (
    symbol: string,
    currentPrice: number
  ): { majorResistance: number; majorSupport: number; srStatus: SRStatus } => {
    // This is a SIMULATION. Replace with actual S/R logic.
    // Example: For BTCUSDT, set arbitrary S/R levels
    let resistance = 0;
    let support = 0;
    if (symbol === "BTCUSDT") {
      resistance = 70000; // Example resistance
      support = 60000;   // Example support
    } else if (symbol === "ETHUSDT") {
      resistance = 4000;
      support = 3000;
    } else {
      // For other symbols, simulate some generic S/R relative to current price
      resistance = currentPrice * 1.05; // 5% above
      support = currentPrice * 0.95;    // 5% below
    }

    let status: SRStatus = "unknown";
    const buffer = currentPrice * 0.005; // 0.5% buffer for "at"
    if (currentPrice >= resistance - buffer && currentPrice <= resistance + buffer) {
        status = "at_resistance";
    } else if (currentPrice > resistance + buffer) {
        status = "above_resistance";
    } else if (currentPrice <= support + buffer && currentPrice >= support - buffer) {
        status = "at_support";
    } else if (currentPrice < support - buffer) {
        status = "below_support";
    } else {
        status = "between";
    }

    return { majorResistance: resistance, majorSupport: support, srStatus: status };
  };

  // Generate trade signals based on priceChangePercent, fundingRate, and S/R
  const generateTradeSignals = (combinedData: SymbolData[]): SymbolTradeSignal[] => {
    return combinedData.map(({ symbol, priceChangePercent, fundingRate, lastPrice, srStatus }) => {
      let signal: "long" | "short" | null = null;
      let entry: number | null = null;
      let stopLoss: number | null = null;
      let takeProfit: number | null = null;
      let isValidatedBySR: boolean = false;
      let srReason: string = "";

      // Bullish Entry Signal: Price up (or neutral) and Funding Rate negative (shorts paying)
      if (priceChangePercent >= 0 && fundingRate < 0) {
        signal = "long";
        entry = lastPrice;
        // Example logic: SL 0.5x of price change, TP 1.5x of price change
        stopLoss = entry - (Math.abs(priceChangePercent) / 100) * entry * 0.5;
        takeProfit = entry + (Math.abs(priceChangePercent) / 100) * entry * 1.5;

        // Validate long signal with S/R
        if (srStatus === "at_support" || srStatus === "below_support" || srStatus === "between") {
          isValidatedBySR = true;
          srReason = srStatus === "at_support" ? "Near Major Support" : srStatus === "below_support" ? "Below Major Support (potential reversal)" : "Between S/R";
        } else if (srStatus === "at_resistance" || srStatus === "above_resistance") {
          isValidatedBySR = false; // Long near resistance could be risky
          srReason = srStatus === "at_resistance" ? "Near Major Resistance (potential reversal)" : "Above Major Resistance (possible overextension)";
        }
      }

      // Bearish Entry Signal: Price down and Funding Rate positive (longs paying)
      if (priceChangePercent < 0 && fundingRate > 0) {
        signal = "short";
        entry = lastPrice;
        // Example logic: SL 0.5x of price change, TP 1.5x of price change
        stopLoss = entry + (Math.abs(priceChangePercent) / 100) * entry * 0.5;
        takeProfit = entry - (Math.abs(priceChangePercent) / 100) * entry * 1.5;

        // Validate short signal with S/R
        if (srStatus === "at_resistance" || srStatus === "above_resistance" || srStatus === "between") {
          isValidatedBySR = true;
          srReason = srStatus === "at_resistance" ? "Near Major Resistance" : srStatus === "above_resistance" ? "Above Major Resistance (potential reversal)" : "Between S/R";
        } else if (srStatus === "at_support" || srStatus === "below_support") {
          isValidatedBySR = false; // Short near support could be risky
          srReason = srStatus === "at_support" ? "Near Major Support (potential bounce)" : "Below Major Support (possible oversold)";
        }
      }

      return { symbol, entry, stopLoss, takeProfit, signal, isValidatedBySR, srReason };
    });
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const infoRes = await fetch(`${BINANCE_API}/fapi/v1/exchangeInfo`);
        const infoData = await infoRes.json();
        const usdtPairs = infoData.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        const [tickerRes, fundingRes] = await Promise.all([
          fetch(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          fetch(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const tickerData = await tickerRes.json();
        const fundingData = await fundingRes.json();

        let combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t: any) => t.symbol === symbol);
          const funding = fundingData.find((f: any) => f.symbol === symbol);
          const lastPrice = parseFloat(ticker?.lastPrice || "0");

          // --- Integrate Mock S/R calculation here ---
          const { majorResistance, majorSupport, srStatus } = getMockSupportResistanceStatus(symbol, lastPrice);

          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: lastPrice,
            majorResistance,
            majorSupport,
            srStatus,
          };
        });

        // Update counts for your stats
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
        const priceUpShortsPaying = combinedData.filter((d) => d.priceChange > 0 && d.fundingRate < 0).length;
        const priceUpLongsPaying = combinedData.filter((d) => d.priceChange > 0 && d.fundingRate > 0).length;
        const priceDownLongsPaying = combinedData.filter((d) => d.priceChange < 0 && d.fundingRate > 0).length;
        const priceDownShortsPaying = combinedData.filter((d) => d.priceChange < 0 && d.fundingRate < 0).length;

        const topShortSqueeze = combinedData
          .filter((d) => d.priceChange > 0 && d.fundingRate < 0)
          .sort((a, b) => a.fundingRate - b.fundingRate) // More negative funding rate means stronger squeeze potential
          .slice(0, 5);

        const topLongTrap = combinedData
          .filter((d) => d.priceChange < 0 && d.fundingRate > 0)
          .sort((a, b) => b.fundingRate - a.fundingRate) // More positive funding rate means stronger trap
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

        // Sorting logic based on current sort settings
        const sorted = [...combinedData].sort((a, b) => {
          // Priority to signal sorting if active
          if (sortBySignal !== null) {
            const signalA = signals.find((s) => s.symbol === a.symbol);
            const signalB = signals.find((s) => s.symbol === b.symbol);

            // Define rank for signals: long validated (0), short validated (1), long (2), short (3), null (4)
            const rank = (s: SymbolTradeSignal | undefined) => {
              if (s?.signal === "long" && s?.isValidatedBySR) return 0;
              if (s?.signal === "short" && s?.isValidatedBySR) return 1;
              if (s?.signal === "long") return 2;
              if (s?.signal === "short") return 3;
              return 4;
            };

            const rankA = rank(signalA);
            const rankB = rank(signalB);

            return sortBySignal === "asc" ? rankA - rankB : rankB - rankA;
          }

          // Fallback to fundingRate or priceChangePercent if signal sorting is not active
          return sortOrder === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy];
        });

        setData(sorted);
      } catch (err) {
        console.error("Error fetching Binance data:", err);
        // Optionally, handle error state in UI
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval); // Cleanup on unmount
  }, [sortBy, sortOrder, sortBySignal]);

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
            {/* 🧮 General Market Bias */}
            <div>
              <p className="text-gray-400 font-semibold mb-1">🧮 General Market Bias:</p>
              ✅ <span className="text-green-400 font-bold">Green</span>: {greenCount} &nbsp;&nbsp;
              ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}
            </div>

            {/* 🔄 24h Price Change Breakdown */}
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

            {/* 📈 Bullish Potential from Short Squeeze */}
            <div>
              <p className="text-green-300 font-semibold mb-1">📈 Bullish Potential (Shorts Paying):</p>
              <span className="text-green-400">Green + Funding ➕:</span>{" "}
              <span className="text-green-300 font-bold">{greenPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-red-400">➖:</span>{" "}
              <span className="text-red-300 font-bold">{greenNegativeFunding}</span>
            </div>

            {/* 📉 Bearish Pressure from Long Trap */}
            <div>
              <p className="text-red-300 font-semibold mb-1">📉 Bearish Risk (Longs Paying):</p>
              <span className="text-red-400">Red + Funding ➕:</span>{" "}
              <span className="text-green-300 font-bold">{redPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-yellow-300">➖:</span>{" "}
              <span className="text-red-200 font-bold">{redNegativeFunding}</span>
            </div>
          </div>
        </div>

        {/* Pro Tips / Overall Sentiment */}
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
          {/* 🟢 Bullish Divergence Card */}
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

          {/* 🔴 Bearish Trap Card */}
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

        {/* New Funding Imbalance Overview Section */}
        <div className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">💰 Funding Imbalance Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-3 rounded shadow-inner">
              <h3 className="text-green-400 font-bold mb-1">🟢 Price Up</h3>
              <p className="text-sm">➕ Longs Paying: {fundingImbalanceData.priceUpLongsPaying}</p>
              <p className="text-sm">➖ Shorts Paying: {fundingImbalanceData.priceUpShortsPaying}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded shadow-inner">
              <h3 className="text-red-400 font-bold mb-1">🔴 Price Down</h3>
              <p className="text-sm">➕ Longs Paying: {fundingImbalanceData.priceDownLongsPaying}</p>
              <p className="text-sm">➖ Shorts Paying: {fundingImbalanceData.priceDownShortsPaying}</p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-yellow-400 font-bold mb-2">🔥 Top Short Squeeze Candidates</h3>
            <ul className="list-disc list-inside text-sm text-yellow-100">
              {fundingImbalanceData.topShortSqueeze.length > 0 ? (
                fundingImbalanceData.topShortSqueeze.map((d) => (
                  <li key={d.symbol}>{d.symbol} — Funding: {(d.fundingRate * 100).toFixed(4)}% | Change: {d.priceChangePercent.toFixed(2)}%</li>
                ))
              ) : (
                <li>No strong short squeeze candidates at the moment.</li>
              )}
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-pink-400 font-bold mb-2">⚠️ Top Long Trap Candidates</h3>
            <ul className="list-disc list-inside text-sm text-pink-100">
              {fundingImbalanceData.topLongTrap.length > 0 ? (
                fundingImbalanceData.topLongTrap.map((d) => (
                  <li key={d.symbol}>{d.symbol} — Funding: {(d.fundingRate * 100).toFixed(4)}% | Change: {d.priceChangePercent.toFixed(2)}%</li>
                ))
              ) : (
                <li>No strong long trap candidates at the moment.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Search Input */}
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

        {/* BarChart */}
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={[
              {
                category: "Green",
                Positive: greenPositiveFunding,
                Negative: greenNegativeFunding,
              },
              {
                category: "Red",
                Positive: redPositiveFunding,
                Negative: redNegativeFunding,
              },
            ]}
          >
            <XAxis dataKey="category" stroke="#aaa" />
            <YAxis stroke="#aaa" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: '#E5E7EB', fontSize: '12px', marginTop: '10px' }} />

            <Bar dataKey="Positive" stackId="a" name="Funding ➕ (Longs Paying)">
              {[greenPositiveFunding, redPositiveFunding].map((_, index) => (
                <Cell key={`positive-${index}`} fill={"#EF4444"} />
              ))}
            </Bar>

            <Bar dataKey="Negative" stackId="a" name="Funding ➖ (Shorts Paying)">
              {[greenNegativeFunding, redNegativeFunding].map((_, index) => (
                <Cell key={`negative-${index}`} fill={"#10B981"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <p className="text-gray-400 text-xs mt-2">
          🟥 Funding ➕ = Longs paying (bearish pressure) | 🟩 Funding ➖ = Shorts paying (bullish pressure)
        </p>

        {/* Table */}
        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs sticky top-0">
              <tr>
                <th className="p-2">Symbol</th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    // Reset signal sort when other sorts are clicked
                    setSortBySignal(null);
                    if (sortBy === "priceChangePercent") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("priceChangePercent");
                      setSortOrder("desc");
                    }
                  }}
                >
                  24h Change {sortBy === "priceChangePercent" && (sortOrder === "asc" ? "🔼" : "🔽")}
                </th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    // Reset signal sort when other sorts are clicked
                    setSortBySignal(null);
                    if (sortBy === "fundingRate") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("fundingRate");
                      setSortOrder("desc");
                    }
                  }}
                >
                  Funding {sortBy === "fundingRate" && (sortOrder === "asc" ? "🔼" : "🔽")}
                </th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    // Disable other sorts when signal sort is active
                    setSortBy("fundingRate"); // Set a default to clear other sort icons
                    setSortOrder("desc"); // Set a default to clear other sort icons
                    setSortBySignal((prev) =>
                      prev === "asc" ? "desc" : prev === "desc" ? null : "asc"
                    );
                  }}
                >
                  Signal {sortBySignal === "asc" ? "🔼" : sortBySignal === "desc" ? "🔽" : ""}
                </th>
                <th className="p-2">S/R Status</th> {/* New column for S/R Status */}
                <th className="p-2">Entry</th>
                <th className="p-2">Stop Loss</th>
                <th className="p-2">Take Profit</th>
                <th className="p-2">★</th>
              </tr>
            </thead>
            <tbody>
              {data // Use 'data' which is already sorted in the useEffect
                .filter(
                  (item) =>
                    (!searchTerm || item.symbol.includes(searchTerm)) &&
                    (!showFavoritesOnly || favorites.includes(item.symbol))
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
                        {signal?.signal && signal.isValidatedBySR !== undefined && (
                          <span
                            className={`ml-1 text-xs px-1 py-0.5 rounded ${
                              signal.isValidatedBySR ? "bg-green-700 text-green-100" : "bg-red-700 text-red-100"
                            }`}
                            title={signal.srReason || "S/R Validation"}
                          >
                            {signal.isValidatedBySR ? "✓" : "✗"}
                          </span>
                        )}
                      </td>

                      {/* New S/R Status Cell */}
                      <td className="p-2 text-gray-400 text-xs">
                        {item.srStatus?.replace(/_/g, ' ') || "N/A"}
                        {item.majorSupport && item.majorResistance && (
                            <span className="ml-1 text-blue-400">
                                (S: {item.majorSupport.toFixed(4)}, R: {item.majorResistance.toFixed(4)})
                            </span>
                        )}
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
