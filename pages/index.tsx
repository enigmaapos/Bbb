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

type SymbolData = {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number; // Ensure lastPrice is always present here
};

type SymbolTradeSignal = {
  symbol: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  signal: "long" | "short" | null;
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

  // Generate trade signals based on priceChangePercent and fundingRate
  const generateTradeSignals = (combinedData: SymbolData[]): SymbolTradeSignal[] => {
    return combinedData.map(({ symbol, priceChangePercent, fundingRate, lastPrice }) => {
      // Bullish Entry Signal: Price up (or neutral) and Funding Rate negative (shorts paying)
      if (priceChangePercent >= 0 && fundingRate < 0) {
        const entry = lastPrice;
        // Example logic: SL 0.5x of price change, TP 1.5x of price change
        const sl = entry - (Math.abs(priceChangePercent) / 100) * entry * 0.5;
        const tp = entry + (Math.abs(priceChangePercent) / 100) * entry * 1.5;
        return { symbol, entry, stopLoss: sl, takeProfit: tp, signal: "long" };
      }

      // Bearish Entry Signal: Price down and Funding Rate positive (longs paying)
      if (priceChangePercent < 0 && fundingRate > 0) {
        const entry = lastPrice;
        // Example logic: SL 0.5x of price change, TP 1.5x of price change
        const sl = entry + (Math.abs(priceChangePercent) / 100) * entry * 0.5;
        const tp = entry - (Math.abs(priceChangePercent) / 100) * entry * 1.5;
        return { symbol, entry, stopLoss: sl, takeProfit: tp, signal: "short" };
      }

      // No clear signal based on these specific conditions
      return { symbol, entry: null, stopLoss: null, takeProfit: null, signal: null };
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

        const combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t: any) => t.symbol === symbol);
          const funding = fundingData.find((f: any) => f.symbol === symbol);
          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: parseFloat(ticker?.lastPrice || "0"), // Ensure lastPrice is populated here
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

        // Generate trade signals BEFORE sorting the main data,
        // so signals are based on the raw fetched data.
        const signals = generateTradeSignals(combinedData);
        setTradeSignals(signals);

        // Sort data based on current sort setting
        const sorted = [...combinedData].sort((a, b) =>
          sortOrder === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]
        );

        setData(sorted);
      } catch (err) {
        console.error("Error fetching Binance data:", err);
        // Optionally, handle error state in UI
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval); // Cleanup on unmount
  }, [sortBy, sortOrder]); // Depend on sortBy and sortOrder to re-sort when they change

  const getSentimentClue = () => {
    const total = greenCount + redCount;
    if (total === 0) return "⚪ Neutral: No clear edge, stay cautious"; // Handle division by zero

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

        <div className="mb-4 text-sm space-y-1">
          <div>
            ✅ <span className="text-green-400 font-bold">Green</span>: {greenCount} &nbsp;&nbsp;
            ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}
          </div>
          <div>
            <span className="text-green-400">Green + Funding ➕:</span>{" "}
            <span className="text-green-300 font-bold">{greenPositiveFunding}</span> |{" "}
            <span className="text-red-400">➖:</span>{" "}
            <span className="text-red-300 font-bold">{greenNegativeFunding}</span>
          </div>
          <div>
            <span className="text-red-400">Red + Funding ➕:</span>{" "}
            <span className="text-green-300 font-bold">{redPositiveFunding}</span> |{" "}
            <span className="text-yellow-300">➖:</span>{" "}
            <span className="text-red-200 font-bold">{redNegativeFunding}</span>
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
              Shorts are paying while price is going up. This creates <strong>squeeze potential</strong>, especially near resistance.
            </p>

            <div className="flex items-center justify-between text-sm text-green-200 mb-2">
              🔼 Price Up + Funding ➖
              <span className="bg-green-700 px-2 py-1 rounded-full font-bold">{priceUpFundingNegativeCount}</span>
            </div>

            {priceUpFundingNegativeCount > 10 && (
              <div className="mt-3 bg-green-800/30 border border-green-600 p-3 rounded-md text-green-200 text-sm font-semibold">
                ✅ Opportunity: Look for <strong>bullish breakouts</strong> or <strong>dip entries</strong> in coins where shorts are paying.
              </div>
            )}
          </div>

          {/* 🔴 Bearish Trap Card */}
          <div className="bg-red-900/40 border border-red-600 p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-bold text-red-300 mb-2">🔴 Bearish Trap</h2>
            <p className="text-sm text-red-100 mb-2">
              Longs are paying while price is dropping. This means bulls are <strong>trapped</strong>, and deeper selloffs may follow.
            </p>

            <div className="flex items-center justify-between text-sm text-red-200 mb-2">
              🔽 Price Down + Funding ➕
              <span className="bg-red-700 px-2 py-1 rounded-full font-bold">{priceDownFundingPositiveCount}</span>
            </div>

            {priceDownFundingPositiveCount > 10 && (
              <div className="mt-3 bg-red-800/30 border border-red-600 p-3 rounded-md text-red-200 text-sm font-semibold">
                ⚠️ Caution: Avoid <strong>longs</strong> on coins still dropping with positive funding — potential liquidation zone.
              </div>
            )}
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
                // positiveColor: "#EF4444", // Funding ➕ → bearish for green
                // negativeColor: "#10B981", // Funding ➖ → bullish for green
              },
              {
                category: "Red",
                Positive: redPositiveFunding,
                Negative: redNegativeFunding,
                // positiveColor: "#EF4444", // Funding ➕ → still bearish for red
                // negativeColor: "#10B981", // Funding ➖ → less common, but still bullish
              },
            ]}
          >
            <XAxis dataKey="category" stroke="#aaa" />
            <YAxis stroke="#aaa" />
            <Tooltip />
            <Legend />

            {/* Longs paying (Bearish) */}
            <Bar dataKey="Positive" stackId="a" name="Funding ➕ (Longs Paying)">
              {[greenPositiveFunding, redPositiveFunding].map((_, index) => (
                <Cell
                  key={`positive-${index}`}
                  fill={
                    // For both green (price up) and red (price down), positive funding is bearish
                    // as it indicates longs are trapped or paying to keep positions open.
                    "#EF4444" // Always red for positive funding
                  }
                />
              ))}
            </Bar>

            {/* Shorts paying (Bullish) */}
            <Bar dataKey="Negative" stackId="a" name="Funding ➖ (Shorts Paying)">
              {[greenNegativeFunding, redNegativeFunding].map((_, index) => (
                <Cell
                  key={`negative-${index}`}
                  fill={
                    // For both green (price up) and red (price down), negative funding is bullish
                    // as it indicates shorts are trapped or paying to keep positions open.
                    "#10B981" // Always green for negative funding
                  }
                />
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
                <th className="p-2">Signal</th>
                <th className="p-2">Entry</th>
                <th className="p-2">Stop Loss</th>
                <th className="p-2">Take Profit</th>
                <th className="p-2">★</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter(
                  (item) =>
                    (!searchTerm || item.symbol.includes(searchTerm)) &&
                    (!showFavoritesOnly || favorites.includes(item.symbol))
                )
                .map((item) => {
                  // Find the corresponding trade signal for the current item
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
