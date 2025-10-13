// pages/index.tsx
import { useEffect, useState } from "react";
import Head from "next/head";
import FundingSentimentChart from "../components/FundingSentimentChart";
import axios from "axios";

interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
}

function isAxiosErrorTypeGuard(error: any): error is import("axios").AxiosError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    error.isAxiosError === true
  );
}

const BINANCE_API = "https://fapi.binance.com";

const formatDavaoTime = (): string => {
  const now = new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(now);
};

export default function PriceFundingTracker() {
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<SymbolData[]>([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [greenPositiveFunding, setGreenPositiveFunding] = useState(0);
  const [greenNegativeFunding, setGreenNegativeFunding] = useState(0);
  const [redPositiveFunding, setRedPositiveFunding] = useState(0);
  const [redNegativeFunding, setRedNegativeFunding] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string>("—");

  // 🟩🟥 New Liquidity Totals
  const [greenLiquidity, setGreenLiquidity] = useState(0);
  const [redLiquidity, setRedLiquidity] = useState(0);
  const [dominantLiquidity, setDominantLiquidity] = useState("");

  useEffect(() => {
    const fetchAllData = async () => {
      setError(null);
      try {
        const [infoRes, tickerRes, fundingRes] = await Promise.all([
          axios.get(`${BINANCE_API}/fapi/v1/exchangeInfo`),
          axios.get(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          axios.get(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const usdtPairs = infoRes.data.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        const tickerData = tickerRes.data;
        const fundingData = fundingRes.data;

        let combinedData: SymbolData[] = usdtPairs
          .map((symbol: string) => {
            const ticker = tickerData.find((t: any) => t.symbol === symbol);
            const funding = fundingData.find((f: any) => f.symbol === symbol);
            return {
              symbol,
              priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
              fundingRate: parseFloat(funding?.lastFundingRate || "0"),
              lastPrice: parseFloat(ticker?.lastPrice || "0"),
              volume: parseFloat(ticker?.quoteVolume || "0"),
            };
          })
          .filter((d: SymbolData) => d.volume > 0);

        // 🌿 Categorize data
        const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        // 🟩🟥 Liquidity totals (by quote volume)
        const greenTotal = combinedData
          .filter((d) => d.priceChangePercent >= 0)
          .reduce((sum, d) => sum + d.volume, 0);
        const redTotal = combinedData
          .filter((d) => d.priceChangePercent < 0)
          .reduce((sum, d) => sum + d.volume, 0);

        setRawData(combinedData);
        setGreenCount(combinedData.filter((d) => d.priceChangePercent >= 0).length);
        setRedCount(combinedData.filter((d) => d.priceChangePercent < 0).length);
        setGreenPositiveFunding(gPos);
        setGreenNegativeFunding(gNeg);
        setRedPositiveFunding(rPos);
        setRedNegativeFunding(rNeg);

        // 🟩🟥 Set liquidity and dominant side
        setGreenLiquidity(greenTotal);
        setRedLiquidity(redTotal);
        setDominantLiquidity(
          greenTotal > redTotal
            ? "Bullish Liquidity (Green)"
            : redTotal > greenTotal
            ? "Bearish Liquidity (Red)"
            : "Balanced"
        );

        setLastUpdated(formatDavaoTime());
      } catch (err: any) {
        console.error("Error fetching market data:", err);
        if (isAxiosErrorTypeGuard(err) && err.response) {
          setError(`Failed to fetch market data: ${err.response.status}`);
        } else {
          setError("Failed to fetch market data. Unknown error.");
        }
      }
    };

    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <Head>
        <title>Binance USDT Perpetual Tracker</title>
        <meta
          name="description"
          content="Real-time Binance USDT Perpetual Tracker with Market Bias and Funding Analysis"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-3 text-blue-400">
          📈 Binance USDT Perpetual Tracker
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Last Updated (Davao City): {lastUpdated}
        </p>

        {error && (
          <div className="mb-4 p-2 bg-red-800 text-red-200 rounded">
            {error}
          </div>
        )}

        {/* --- Market Summary Section --- */}
        <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">
            📊 Market Summary
          </h2>

          <div className="text-sm space-y-4">
            <div>
              <p className="text-gray-400 font-semibold mb-1">🧮 General Market Bias:</p>
              ✅ <span className="text-green-400 font-bold">{greenCount}</span> Green &nbsp;&nbsp;
              ❌ <span className="text-red-400 font-bold">{redCount}</span> Red
            </div>

            {/* --- NEW LIQUIDITY SECTION --- */}
            <div>
              <p className="text-yellow-300 font-semibold mb-1">💧 Transaction Liquidity Summary:</p>
              <ul className="text-gray-200 ml-4 list-disc space-y-1">
                <li>
                  <span className="text-green-400 font-semibold">Total Green Liquidity:</span>{" "}
                  {greenLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                </li>
                <li>
                  <span className="text-red-400 font-semibold">Total Red Liquidity:</span>{" "}
                  {redLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                </li>
                <li>
                  <span className="text-blue-400 font-semibold">Dominant Side:</span>{" "}
                  <span
                    className={
                      dominantLiquidity.includes("Bullish")
                        ? "text-green-400 font-bold"
                        : dominantLiquidity.includes("Bearish")
                        ? "text-red-400 font-bold"
                        : "text-yellow-400 font-bold"
                    }
                  >
                    {dominantLiquidity}
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-blue-300 font-semibold mb-1">🔄 24h Price Change:</p>
              <ul className="text-blue-100 ml-4 list-disc space-y-1">
                <li>
                  <span className="font-semibold text-green-400">Price Increase (≥ 5%)</span>:{" "}
                  {rawData.filter((item) => item.priceChangePercent >= 5).length}
                </li>
                <li>
                  <span className="font-semibold text-yellow-300">Mild Movement (±0–5%)</span>:{" "}
                  {rawData.filter((item) => item.priceChangePercent > -5 && item.priceChangePercent < 5).length}
                </li>
                <li>
                  <span className="font-semibold text-red-400">Price Drop (≤ -5%)</span>:{" "}
                  {rawData.filter((item) => item.priceChangePercent <= -5).length}
                </li>
              </ul>
            </div>

            <div>
              <p className="text-green-300 font-semibold mb-1">📈 Bullish Potential (Shorts Paying):</p>
              <span className="text-green-400">Green + Funding ➕:</span>{" "}
              <span className="text-red-300 font-bold">{greenPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-red-400">➖:</span>{" "}
              <span className="text-green-300 font-bold">{greenNegativeFunding}</span>
            </div>

            <div>
              <p className="text-red-300 font-semibold mb-1">📉 Bearish Risk (Longs Paying):</p>
              <span className="text-red-400">Red + Funding ➕:</span>{" "}
              <span className="text-red-300 font-bold">{redPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-yellow-300">➖:</span>{" "}
              <span className="text-green-200 font-bold">{redNegativeFunding}</span>
            </div>
          </div>
        </div>

        {/* Funding Sentiment Chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <FundingSentimentChart
            greenPositiveFunding={greenPositiveFunding}
            greenNegativeFunding={greenNegativeFunding}
            redPositiveFunding={redPositiveFunding}
            redNegativeFunding={redNegativeFunding}
          />
        </div>

        {/* --- ATH Gap Difference Calculator --- */}
        <div className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">
            🧮 ATH Gap Difference Calculator
          </h2>
          <AthGapCalculator data={rawData} />
        </div>

        {/* --- Footer --- */}
        <footer className="mt-10 border-t border-gray-700 pt-6 text-sm text-gray-400 text-center">
          <p>© {new Date().getFullYear()} Binance USDT Perpetual Tracker</p>
          <p className="mt-1">
            Built with ❤️ using{" "}
            <a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Next.js
            </a>{" "}
            &{" "}
            <a href="https://binance-docs.github.io/apidocs/futures/en/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">
              Binance Futures API
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ------------------ ATH GAP CALCULATOR COMPONENT ------------------ */

function AthGapCalculator({ data }: { data: SymbolData[] }) {
  const [symbol, setSymbol] = useState("");
  const [ath, setAth] = useState("");
  const [entry, setEntry] = useState("");
  const [result, setResult] = useState<{ gap: number; roi: number } | null>(null);

  const calculateGap = () => {
    const athNum = parseFloat(ath);
    const entryNum = parseFloat(entry);
    if (!athNum || !entryNum || athNum <= 0 || entryNum <= 0) {
      alert("Please enter valid positive numbers for ATH and entry.");
      return;
    }
    const gap = ((athNum - entryNum) / athNum) * 100;
    const roi = ((athNum - entryNum) / entryNum) * 100;
    setResult({ gap, roi });
  };

  const handleSelectSymbol = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sym = e.target.value;
    setSymbol(sym);
    const found = data.find((d) => d.symbol === sym);
    if (found) setEntry(found.lastPrice.toString());
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <select
          value={symbol}
          onChange={handleSelectSymbol}
          className="bg-gray-900 border border-gray-700 p-2 rounded text-white flex-1"
        >
          <option value="">Select Symbol (optional)</option>
          {data
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
            .map((d) => (
              <option key={d.symbol} value={d.symbol}>
                {d.symbol} — {d.lastPrice.toFixed(2)}
              </option>
            ))}
        </select>

        <input
          type="number"
          placeholder="ATH Price"
          value={ath}
          onChange={(e) => setAth(e.target.value)}
          className="bg-gray-900 border border-gray-700 p-2 rounded text-white flex-1"
        />
        <input
          type="number"
          placeholder="Entry Price"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="bg-gray-900 border border-gray-700 p-2 rounded text-white flex-1"
        />
      </div>

      <button
        onClick={calculateGap}
        className="bg-blue-600 hover:bg-blue-700 transition p-2 rounded font-semibold"
      >
        Compute Gap Difference
      </button>

      {result && (
        <div className="mt-4 text-sm text-gray-200 space-y-3">
          <div>
            🔻 <span className="font-semibold text-red-400">Below ATH:</span>{" "}
            {result.gap.toFixed(2)}%
          </div>
          <div>
            💹 <span className="font-semibold text-green-400">Potential ROI to ATH:</span>{" "}
            {result.roi.toFixed(2)}%
          </div>

          {/* Visual bar chart */}
          <div className="mt-3">
            <p className="text-gray-400 text-xs mb-1">Visual Gap:</p>
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div
                className="bg-green-500 h-4"
                style={{ width: `${Math.min(100 - result.gap, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {result.gap.toFixed(2)}% below ATH — {result.roi.toFixed(2)}% upside potential
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
