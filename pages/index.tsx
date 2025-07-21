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
        <div className="mb-4 text-sm space-y-1">
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
            <span className="text-green-200 font-bold"> {redNegativeFunding} </span>
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

          {/* How to Read the Chart Visually */}
          <div className="mt-4 text-sm text-gray-400">
            <h3 className="text-white font-semibold mb-2">🧠 How to Read the Chart Visually</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-gray-800 p-3 rounded-lg">
                <p className="font-bold text-green-400">Green Group</p>
                <p><span className="text-green-300">Taller Green Bar:</span> More bullish momentum (longs dominate)</p>
                <p><span className="text-red-300">Taller Red Bar:</span> Reversal potential (shorts paying but price up)</p>
              </div>
              <div className="bg-gray-800 p-3 rounded-lg">
                <p className="font-bold text-red-400">Red Group</p>
                <p><span className="text-green-300">Taller Green Bar:</span> Bullish trap (longs losing)</p>
                <p><span className="text-red-300">Taller Red Bar:</span> Bearish momentum (shorts dominate)</p>
              </div>
            </div>
          </div>
        </div>

        {/* (Keep rest of your interpretation + table unchanged) */}
        {/* ... */}
      </div>
    </div>
  );
}
