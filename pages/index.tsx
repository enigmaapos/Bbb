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

        const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        setRawData(combinedData);
        setGreenCount(combinedData.filter((d) => d.priceChangePercent >= 0).length);
        setRedCount(combinedData.filter((d) => d.priceChangePercent < 0).length);
        setGreenPositiveFunding(gPos);
        setGreenNegativeFunding(gNeg);
        setRedPositiveFunding(rPos);
        setRedNegativeFunding(rNeg);

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
            {/* General Bias */}
            <div>
              <p className="text-gray-400 font-semibold mb-1">🧮 General Market Bias:</p>
              ✅ <span className="text-green-400 font-bold">{greenCount}</span> Green &nbsp;&nbsp;
              ❌ <span className="text-red-400 font-bold">{redCount}</span> Red
            </div>

            {/* 24h Price Change */}
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

            {/* Bullish Potential */}
            <div>
              <p className="text-green-300 font-semibold mb-1">📈 Bullish Potential (Shorts Paying):</p>
              <span className="text-green-400">Green + Funding ➕:</span>{" "}
              <span className="text-red-300 font-bold">{greenPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-red-400">➖:</span>{" "}
              <span className="text-green-300 font-bold">{greenNegativeFunding}</span>
            </div>

            {/* Bearish Risk */}
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
      </div>
    </div>
  );
}
