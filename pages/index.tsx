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
};

export default function PriceFundingTracker() {
  const [data, setData] = useState<SymbolData[]>([]);
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
          };
        });

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

        const sorted = [...combinedData].sort((a, b) =>
          sortOrder === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]
        );

        setData(sorted);
      } catch (err) {
        console.error("Error fetching Binance data:", err);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [sortBy, sortOrder]);

  const getSentimentClue = () => {
    const total = greenCount + redCount;
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
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📈 Binance USDT Perpetual Tracker</h1>

        <div className="mb-4 text-sm space-y-1">
          <div>✅ <span className="text-green-400 font-bold">Green</span>: {greenCount} &nbsp;&nbsp;
               ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}</div>
          <div><span className="text-green-400">Green + Funding ➕:</span>{" "}
            <span className="text-green-300 font-bold">{greenPositiveFunding}</span> |{" "}
            <span className="text-red-400">➖:</span>{" "}
            <span className="text-red-300 font-bold">{greenNegativeFunding}</span></div>
          <div><span className="text-red-400">Red + Funding ➕:</span>{" "}
            <span className="text-green-300 font-bold">{redPositiveFunding}</span> |{" "}
            <span className="text-yellow-300">➖:</span>{" "}
            <span className="text-red-200 font-bold">{redNegativeFunding}</span></div>
        </div>

        {/* Pro Tips */}
<p className="text-white text-sm font-bold mb-2">
  🌐 Overall Sentiment:{" "}
  <span className={
    getSentimentClue().includes("🟢")
      ? "text-green-400"
      : getSentimentClue().includes("🔴")
      ? "text-red-400"
      : getSentimentClue().includes("🟡")
      ? "text-yellow-300"
      : "text-gray-400"
  }>
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
        ✅ Opportunity: Look for <strong>bullish breakouts</strong> or <strong>dip entries</strong> in coins where shorts are paying.
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

        <ResponsiveContainer width="100%" height={250}>
  <BarChart
    data={[
      {
        category: "Green",
        Positive: greenPositiveFunding,
        Negative: greenNegativeFunding,
        positiveColor: "#EF4444", // Funding ➕ → bearish for green
        negativeColor: "#10B981", // Funding ➖ → bullish for green
      },
      {
        category: "Red",
        Positive: redPositiveFunding,
        Negative: redNegativeFunding,
        positiveColor: "#EF4444", // Funding ➕ → still bearish for red
        negativeColor: "#10B981", // Funding ➖ → less common, but still bullish
      },
    ]}
  >
    <XAxis dataKey="category" stroke="#aaa" />
    <YAxis stroke="#aaa" />
    <Tooltip />
    <Legend />
    
    {/* Longs paying (Bearish) */}
    <Bar dataKey="Positive" stackId="a" name="Funding ➕ (Bearish)">
      {[greenPositiveFunding, redPositiveFunding].map((_, index) => (
        <Cell
          key={`positive-${index}`}
          fill={
            index === 0 ? "#EF4444" : "#EF4444" // both are bearish, shown red
          }
        />
      ))}
    </Bar>

    {/* Shorts paying (Bullish) */}
    <Bar dataKey="Negative" stackId="a" name="Funding ➖ (Bullish)">
      {[greenNegativeFunding, redNegativeFunding].map((_, index) => (
        <Cell
          key={`negative-${index}`}
          fill={
            index === 0 ? "#10B981" : "#10B981" // both bullish, shown green
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
        <div className="overflow-auto">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
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
              </tr>
            </thead>
            <tbody>
              {data
                .filter(
                  (item) =>
                    (!searchTerm || item.symbol.includes(searchTerm)) &&
                    (!showFavoritesOnly || favorites.includes(item.symbol))
                )
                .map((item) => (
                  <tr key={item.symbol} className="border-t border-gray-700">
                    <td className="p-2 flex items-center gap-2">
                      {item.symbol}
                      <button
                        onClick={() =>
                          setFavorites((prev) =>
                            prev.includes(item.symbol)
                              ? prev.filter((sym) => sym !== item.symbol)
                              : [...prev, item.symbol]
                          )
                        }
                        className={favorites.includes(item.symbol) ? "text-yellow-400" : "text-gray-500"}
                      >
                        {favorites.includes(item.symbol) ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="p-2">
                      <span className={item.priceChangePercent >= 0 ? "text-green-400" : "text-red-400"}>
                        {item.priceChangePercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="p-2">
                      <span className={item.fundingRate >= 0 ? "text-green-400" : "text-red-400"}>
                        {(item.fundingRate * 100).toFixed(4)}%
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <p className="text-gray-500 text-xs mt-6">Auto-refreshes every 10 seconds | Powered by Binance API</p>
      </div>
    </div>
  );
}
