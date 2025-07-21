// components/PriceFundingTracker.tsx
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar
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

        const sorted = [...combinedData].sort((a, b) =>
          sortOrder === "desc"
            ? b[sortBy] - a[sortBy]
            : a[sortBy] - b[sortBy]
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

        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-sm space-y-1">
            <div>
              ✅ Green: <span className="text-green-400 font-bold">{greenCount}</span> 
              &nbsp;&nbsp;❌ Red: <span className="text-red-400 font-bold">{redCount}</span>
            </div>
            <div>
              Green + Funding ➕: <span className="text-green-300">{greenPositiveFunding}</span> | 
              ➖: <span className="text-yellow-300">{greenNegativeFunding}</span>
            </div>
            <div>
              Red + Funding ➕: <span className="text-green-300">{redPositiveFunding}</span> | 
              ➖: <span className="text-yellow-300">{redNegativeFunding}</span>
            </div>
          </div>
        </div>

        {/* 📊 Chart Section */}
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
                <Bar dataKey="Positive" stackId="a" fill="#34d399" name="Funding ➕" />
                <Bar dataKey="Negative" stackId="a" fill="#facc15" name="Funding ➖" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-gray-400 text-xs mt-2">
            ➕ Funding = Longs pay Shorts | ➖ Funding = Shorts pay Longs
          </p>
        </div>

        {/* 🧠 Interpretation Section */}
        <div className="mt-8 space-y-4 text-sm text-gray-200">
          <h2 className="text-xl font-bold text-white">🧠 Market Interpretation</h2>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="font-bold text-green-400">✅ Green + Funding ➕</p>
            <p>Price is going up and longs are paying shorts → bullish momentum. Longs are confident and in control.</p>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="font-bold text-yellow-300">✅ Green + Funding ➖</p>
            <p>Price is up but shorts are paying longs → indicates potential reversal or short squeeze risk. Market expectation is bearish, but price says otherwise.</p>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="font-bold text-red-400">❌ Red + Funding ➕</p>
            <p>Price is down but longs are still paying → longs are losing on both sides. Market is correcting but traders are overly bullish.</p>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="font-bold text-yellow-400">❌ Red + Funding ➖</p>
            <p>Price is dropping and shorts are paying → no current data here (rare). If it happens, it may show short exhaustion or contrarian opportunity.</p>
          </div>
        </div>

        {/* Table Section */}
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
                  <span
                    className={sortBy === "priceChangePercent" ? "font-bold underline" : ""}
                  >
                    24h Change{" "}
                    {sortBy === "priceChangePercent" &&
                      (sortOrder === "asc" ? "🔼" : "🔽")}
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
                    Funding Fee{" "}
                    {sortBy === "fundingRate" &&
                      (sortOrder === "asc" ? "🔼" : "🔽")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.symbol} className="border-t border-gray-700">
                  <td className="p-2 font-medium">{item.symbol}</td>
                  <td className="p-2">
                    <span
                      className={
                        item.priceChangePercent >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {item.priceChangePercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        item.fundingRate >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
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
