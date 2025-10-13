// ✅ /pages/index.tsx — Full Version with Added TXN Dominance Computation
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
  const [lastUpdated, setLastUpdated] = useState("—");

  // 🟩🟥 Liquidity Totals
  const [greenLiquidity, setGreenLiquidity] = useState(0);
  const [redLiquidity, setRedLiquidity] = useState(0);
  const [dominantLiquidity, setDominantLiquidity] = useState("");

  // 🧭 Transaction Dominance (Executed Trade Flow)
  const [greenTxn, setGreenTxn] = useState(0);
  const [redTxn, setRedTxn] = useState(0);
  const [txnDominant, setTxnDominant] = useState("");

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
          .filter(
            (s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT")
          )
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

        // 🌿 Categorization
        const gPos = combinedData.filter(
          (d) => d.priceChangePercent >= 0 && d.fundingRate >= 0
        ).length;
        const gNeg = combinedData.filter(
          (d) => d.priceChangePercent >= 0 && d.fundingRate < 0
        ).length;
        const rPos = combinedData.filter(
          (d) => d.priceChangePercent < 0 && d.fundingRate >= 0
        ).length;
        const rNeg = combinedData.filter(
          (d) => d.priceChangePercent < 0 && d.fundingRate < 0
        ).length;

        // 💧 Liquidity Totals
        const greenTotal = combinedData
          .filter((d) => d.priceChangePercent >= 0)
          .reduce((sum, d) => sum + d.volume, 0);
        const redTotal = combinedData
          .filter((d) => d.priceChangePercent < 0)
          .reduce((sum, d) => sum + d.volume, 0);

        // 🧭 Transaction Dominance (Executed Flow)
        const totalGreenTxn = combinedData
          .filter((d) => d.priceChangePercent >= 0)
          .reduce((sum, d) => sum + d.volume, 0);

        const totalRedTxn = combinedData
          .filter((d) => d.priceChangePercent < 0)
          .reduce((sum, d) => sum + d.volume, 0);

        const txnDominantSide =
          totalGreenTxn > totalRedTxn
            ? "🟢 Bullish (Green)"
            : totalRedTxn > totalGreenTxn
            ? "🔴 Bearish (Red)"
            : "⚫ Neutral";

        // 🧾 State updates
        setRawData(combinedData);
        setGreenCount(combinedData.filter((d) => d.priceChangePercent >= 0).length);
        setRedCount(combinedData.filter((d) => d.priceChangePercent < 0).length);
        setGreenPositiveFunding(gPos);
        setGreenNegativeFunding(gNeg);
        setRedPositiveFunding(rPos);
        setRedNegativeFunding(rNeg);

        setGreenLiquidity(greenTotal);
        setRedLiquidity(redTotal);
        setDominantLiquidity(
          greenTotal > redTotal
            ? "Bullish Liquidity (Green)"
            : redTotal > greenTotal
            ? "Bearish Liquidity (Red)"
            : "Balanced"
        );

        setGreenTxn(totalGreenTxn);
        setRedTxn(totalRedTxn);
        setTxnDominant(txnDominantSide);
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
    <div className="max-w-7xl mx-auto text-gray-100">
      <Head>
        <title>Binance USDT Perpetual Tracker</title>
      </Head>

      <h1 className="text-3xl font-bold mb-3 text-blue-400">
        📈 Binance USDT Perpetual Tracker
      </h1>
      <p className="text-sm text-gray-400 mb-6">
        Last Updated (Davao City): {lastUpdated}
      </p>

      {error && (
        <div className="mb-4 p-2 bg-red-800 text-red-200 rounded">{error}</div>
      )}

      {/* --- Market Summary --- */}
      <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
        <h2 className="text-lg font-bold text-white mb-3">📊 Market Summary</h2>

        <div className="text-sm space-y-4">
          <div>
            <p className="text-gray-400 font-semibold mb-1">
              🧮 General Market Bias:
            </p>
            ✅ <span className="text-green-400 font-bold">{greenCount}</span> Green &nbsp;&nbsp;
            ❌ <span className="text-red-400 font-bold">{redCount}</span> Red
          </div>

          {/* 💧 Transaction Liquidity */}
          <div>
            <p className="text-yellow-300 font-semibold mb-1">
              💧 Transaction Liquidity Summary:
            </p>
            <ul className="ml-4 text-gray-200 list-disc space-y-1">
              <li>
                🟢 <b>Total Green Liquidity:</b> {greenLiquidity.toLocaleString()} USDT
              </li>
              <li>
                🔴 <b>Total Red Liquidity:</b> {redLiquidity.toLocaleString()} USDT
              </li>
              <li>
                ⚖️ <b>Dominant Liquidity:</b>{" "}
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

          {/* 🧭 TXN Dominance */}
          <div>
            <p className="text-cyan-300 font-semibold mb-1">
              🧭 Transaction Dominance (Executed Trades):
            </p>
            <ul className="ml-4 text-gray-200 list-disc space-y-1">
              <li>
                🟢 <b>Total Bullish TXN:</b> {greenTxn.toLocaleString()} USDT
              </li>
              <li>
                🔴 <b>Total Bearish TXN:</b> {redTxn.toLocaleString()} USDT
              </li>
              <li>
                ⚖️ <b>Dominant Side:</b>{" "}
                <span
                  className={
                    txnDominant.includes("Bullish")
                      ? "text-green-400 font-bold"
                      : txnDominant.includes("Bearish")
                      ? "text-red-400 font-bold"
                      : "text-yellow-400 font-bold"
                  }
                >
                  {txnDominant}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
