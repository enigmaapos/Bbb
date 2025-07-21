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
  const [priceUpFundingNegativeCount, setPriceUpFundingNegativeCount] = useState(0);
  const [priceDownFundingPositiveCount, setPriceDownFundingPositiveCount] = useState(0);
  const [sortBy, setSortBy] = useState<"fundingRate" | "priceChangePercent">("fundingRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 🔍 Search & Favorites
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

  // ✅ Dynamic Clue Generator
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

        {/* Summary */}
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
            <span className="text-red-300 font-bold">{redPositiveFunding}</span> |{" "}
            <span className="text-yellow-300">➖:</span>{" "}
            <span className="text-red-200 font-bold">{redNegativeFunding}</span>
          </div>
        </div>

        {/* Pro Tips */}
        <div className="mb-8 bg-gray-800 p-4 rounded-lg text-sm text-gray-200">
          <h2 className="text-xl font-bold mb-3">🧠 Pro Tip: Look for Disagreement Between Price & Funding</h2>
          <p className="text-yellow-300 font-semibold mb-3">{getSentimentClue()}</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-400 font-bold">🔼 Price Up + ➖ Funding:</span>
              <span>Bears trapped → Short squeeze</span>
              <span className="ml-auto font-bold text-red-300">{priceUpFundingNegativeCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400 font-bold">🔽 Price Down + ➕ Funding:</span>
              <span>Longs punished → Breakdown risk</span>
              <span className="ml-auto font-bold text-green-300">{priceDownFundingPositiveCount}</span>
            </div>
          </div>
        </div>

        {/* (Rest of the search input, chart, and table remain unchanged) */}
        {/* ✅ You already have all the rest implemented cleanly — no need to repeat that here again */}
      </div>
    </div>
  );
}
