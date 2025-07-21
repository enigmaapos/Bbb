// components/PriceFundingTracker.tsx
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
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

  // New state for Pro Tip dynamic counts
  const [priceUpFundingNegativeCount, setPriceUpFundingNegativeCount] = useState(0);
  const [priceDownFundingPositiveCount, setPriceDownFundingPositiveCount] = useState(0);

  const [sortBy, setSortBy] = useState<"fundingRate" | "priceChangePercent">("fundingRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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

        // New Pro Tip counts
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📈 Binance USDT Perpetual Tracker</h1>

        {/* Summary */}
        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-sm space-y-1">
            <div>
              ✅ <span className="text-green-400 font-bold">Green</span>: {greenCount} &nbsp;&nbsp;
              ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}
            </div>
            <div>
              <span className="text-green-400">Green + Funding ➕:</span>
              <span className="text-green-300 font-bold"> {greenPositiveFunding} </span>&nbsp;|&nbsp;
              <span className="text-red-400">➖:</span>
              <span className="text-red-300 font-bold"> {greenNegativeFunding} </span>
            </div>
            <div>
              <span className="text-red-400">Red + Funding ➕:</span>
              <span className="text-red-300 font-bold"> {redPositiveFunding} </span>&nbsp;|&nbsp;
              <span className="text-yellow-300">➖:</span>
              <span className="text-red-200 font-bold"> {redNegativeFunding} </span>
            </div>
          </div>
        </div>

        {/* Pro Tips Section */}
        <div className="mb-8 bg-gray-800 p-4 rounded-lg shadow-md text-sm text-gray-200">
          <h2 className="text-xl font-bold mb-3">🧠 Pro Tip: Look for Disagreement Between Price & Funding</h2>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-green-400 font-bold">🔼 Price Up + ➖ Funding:</span>
              <span>Bears are getting trapped → possible short squeeze</span>
              <span className="ml-auto font-bold text-green-300">{priceUpFundingNegativeCount}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-red-400 font-bold">🔽 Price Down + ➕ Funding:</span>
              <span>Longs are getting punished → bearish breakdown</span>
              <span className="ml-auto font-bold text-red-300">{priceDownFundingPositiveCount}</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-6 bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4">📊 Market Sentiment Breakdown</h2>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
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
                margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="category" stroke="#aaa" />
                <YAxis stroke="#aaa" />
                <Tooltip />
                <Legend />
                <Bar dataKey="Positive" stackId="a" fill="#10B981" name="Funding ➕ (Bullish)" />
                <Bar dataKey="Negative" stackId="a" fill="#EF4444" name="Funding ➖ (Bearish)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-gray-400 text-xs mt-2">
            ➕ Funding = Longs pay Shorts | ➖ Funding = Shorts pay Longs
          </p>
        </div>

        {/* Chart Reading Guide */}
        <div className="mt-6 bg-gray-800 p-4 rounded-lg shadow-sm text-sm text-gray-200">
          <h2 className="text-xl font-bold text-white mb-2">🧠 How to Read the Chart Visually</h2>
          <table className="table-auto w-full border border-gray-700 text-center text-xs">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="border border-gray-600 p-2">Bar Group</th>
                <th className="border border-gray-600 p-2">Taller Green Bar</th>
                <th className="border border-gray-600 p-2">Taller Red Bar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-600 p-2 font-bold text-green-400">Green</td>
                <td className="border border-gray-600 p-2 text-green-300">More bullish momentum (longs dominate)</td>
                <td className="border border-gray-600 p-2 text-yellow-300">Reversal potential (shorts paying but price up)</td>
              </tr>
              <tr>
                <td className="border border-gray-600 p-2 font-bold text-red-400">Red</td>
                <td className="border border-gray-600 p-2 text-red-300">Bullish trap (longs losing)</td>
                <td className="border border-gray-600 p-2 text-yellow-300">Bearish momentum (shorts dominate)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table */}
        <div className="overflow-auto mt-8">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
              <tr>
                <th className="p-2">Symbol</th>
                <th
                  className="p-2 cursor-pointer select-none"
                  onClick={() => {
                    if (sortBy === "priceChangePercent") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("priceChangePercent");
                      setSortOrder("desc");
                    }
                  }}
                >
                  <span className={sortBy === "priceChangePercent" ? "font-bold underline" : ""}>
                    24h Change {sortBy === "priceChangePercent" && (sortOrder === "asc" ? "🔼" : "🔽")}
                  </span>
                </th>
                <th
                  className="p-2 cursor-pointer select-none"
                  onClick={() => {
                    if (sortBy === "fundingRate") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("fundingRate");
                      setSortOrder("desc");
                    }
                  }}
                >
                  <span className={sortBy === "fundingRate" ? "font-bold underline" : ""}>
                    Funding Fee {sortBy === "fundingRate" && (sortOrder === "asc" ? "🔼" : "🔽")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.symbol} className="border-t border-gray-700">
                  <td className="p-2 font-medium">{item.symbol}</td>
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

        <p className="text-gray-500 text-xs mt-6">
          Auto-refreshes every 10 seconds | Powered by Binance API
        </p>
      </div>
    </div>
  );
}
