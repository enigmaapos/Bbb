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
  volume: number; // quoteVolume in USDT
}

interface Liquidation {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
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

  // 🟩🟥 Liquidity Totals
  const [greenLiquidity, setGreenLiquidity] = useState(0);
  const [redLiquidity, setRedLiquidity] = useState(0);
  const [dominantLiquidity, setDominantLiquidity] = useState("");

  // 🧭 Transaction Dominance
  const [greenTxn, setGreenTxn] = useState(0);
  const [redTxn, setRedTxn] = useState(0);
  const [txnDominant, setTxnDominant] = useState("");

  // ⚡ ADL Dominance
  const [totalLongLiq, setTotalLongLiq] = useState(0);
  const [totalShortLiq, setTotalShortLiq] = useState(0);
  const [adlPressureSide, setAdlPressureSide] = useState("");

  // Search input
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchAllData = async () => {
      setError(null);
      try {
        const [infoRes, tickerRes, fundingRes, liquidationRes] = await Promise.all([
          axios.get(`${BINANCE_API}/fapi/v1/exchangeInfo`),
          axios.get(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          axios.get(`${BINANCE_API}/fapi/v1/premiumIndex`),
          axios.get(`${BINANCE_API}/fapi/v1/allForceOrders?limit=500`), // latest liquidations
        ]);

        const usdtPairs = infoRes.data.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        const tickerData = tickerRes.data;
        const fundingData = fundingRes.data;
        const liquidationData: Liquidation[] = liquidationRes.data;

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
        const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        // 💧 Liquidity
        const greenTotal = combinedData.filter((d) => d.priceChangePercent >= 0).reduce((sum, d) => sum + d.volume, 0);
        const redTotal = combinedData.filter((d) => d.priceChangePercent < 0).reduce((sum, d) => sum + d.volume, 0);

        // 🧭 TXN Dominance
        const totalGreenTxn = greenTotal;
        const totalRedTxn = redTotal;
        const txnDominantSide =
          totalGreenTxn > totalRedTxn
            ? "🟢 Bullish (Green)"
            : totalRedTxn > totalGreenTxn
            ? "🔴 Bearish (Red)"
            : "⚫ Neutral";

        // ⚡ ADL Dominance (using liquidation flow)
        const longLiqTotal = liquidationData
          .filter((liq) => liq.side === "BUY")
          .reduce((sum, liq) => sum + liq.price * liq.qty, 0);
        const shortLiqTotal = liquidationData
          .filter((liq) => liq.side === "SELL")
          .reduce((sum, liq) => sum + liq.price * liq.qty, 0);

        const adlSide =
          longLiqTotal > shortLiqTotal
            ? "🔴 Bearish ADL Pressure (Shorts Profiting)"
            : shortLiqTotal > longLiqTotal
            ? "🟢 Bullish ADL Pressure (Longs Profiting)"
            : "⚫ Balanced ADL";

        // Update states
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
          greenTotal > redTotal ? "Bullish Liquidity (Green)" : redTotal > greenTotal ? "Bearish Liquidity (Red)" : "Balanced"
        );
        setGreenTxn(totalGreenTxn);
        setRedTxn(totalRedTxn);
        setTxnDominant(txnDominantSide);
        setTotalLongLiq(longLiqTotal);
        setTotalShortLiq(shortLiqTotal);
        setAdlPressureSide(adlSide);
        setLastUpdated(formatDavaoTime());
      } catch (err: any) {
        console.error("Error fetching market data:", err);
        setError("Failed to fetch market data.");
      }
    };

    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatCompact = (n: number) => {
    if (!n) return "—";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(2);
  };

  const filteredCoins = rawData.filter((d) => d.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase())).slice(0, 100);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <Head>
        <title>Binance USDT Perpetual Tracker</title>
      </Head>

      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-3 text-blue-400">📈 Binance USDT Perpetual Tracker</h1>
        <p className="text-sm text-gray-400 mb-6">Last Updated (Davao): {lastUpdated}</p>

        {error && <div className="mb-4 p-2 bg-red-800 text-red-200 rounded">{error}</div>}

        {/* --- MARKET SUMMARY --- */}
        <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">📊 Market Summary</h2>

          <div className="text-sm space-y-4">
            <div>
              <p className="text-gray-400 font-semibold mb-1">🧮 General Market Bias:</p>
              ✅ <span className="text-green-400 font-bold">{greenCount}</span> Green &nbsp; ❌{" "}
              <span className="text-red-400 font-bold">{redCount}</span> Red
            </div>

            {/* 💧 LIQUIDITY */}
            <div>
              <p className="text-yellow-300 font-semibold mb-1">💧 Transaction Liquidity Summary:</p>
              <ul className="ml-4 list-disc text-gray-200 space-y-1">
                <li>🟢 {formatCompact(greenLiquidity)} Bullish Liquidity</li>
                <li>🔴 {formatCompact(redLiquidity)} Bearish Liquidity</li>
                <li>🏆 Dominant: <span className="font-bold">{dominantLiquidity}</span></li>
              </ul>
            </div>

            {/* 🧭 TXN DOMINANCE CARD */}
            <div className="bg-gray-800/50 border border-cyan-700/40 rounded-2xl p-4 shadow-sm mt-2">
              <p className="text-cyan-300 font-bold text-lg mb-2">🧭 Transaction Dominance</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-gray-100 text-sm">
                <div className="bg-green-800/20 border border-green-600/20 rounded-xl p-3 text-center">
                  <p className="text-green-400 font-semibold">Bullish TXN</p>
                  <p className="text-xl font-bold">{formatCompact(greenTxn)}</p>
                </div>
                <div className="bg-red-800/20 border border-red-600/20 rounded-xl p-3 text-center">
                  <p className="text-red-400 font-semibold">Bearish TXN</p>
                  <p className="text-xl font-bold">{formatCompact(redTxn)}</p>
                </div>
                <div className="bg-yellow-800/10 border border-yellow-600/20 rounded-xl p-3 text-center">
                  <p className="text-yellow-300 font-semibold">Gap Diff</p>
                  <p className="text-xl font-bold">{formatCompact(Math.abs(greenTxn - redTxn))}</p>
                </div>
                <div className="rounded-xl p-3 text-center border border-gray-600">
                  <p className="text-gray-300">Dominant Side</p>
                  <p className="text-xl font-bold">{txnDominant}</p>
                </div>
              </div>
            </div>

            {/* ⚡ ADL DOMINANCE CARD */}
            <div className="bg-gray-800/60 border border-purple-600/30 rounded-2xl p-4 mt-4 shadow-sm">
              <p className="text-purple-300 font-bold text-lg mb-2">⚡ ADL Dominance (Inferred)</p>
              <ul className="ml-4 list-disc text-gray-200 space-y-1">
                <li><span className="text-green-400 font-semibold">Long Liq Volume:</span> {formatCompact(totalLongLiq)} USDT</li>
                <li><span className="text-red-400 font-semibold">Short Liq Volume:</span> {formatCompact(totalShortLiq)} USDT</li>
                <li><span className="text-yellow-300 font-semibold">Dominant Side:</span> <span className="font-bold">{adlPressureSide}</span></li>
              </ul>
            </div>
          </div>
        </div>

        {/* 🧭 TXN EXPLORER */}
        <div className="bg-gray-900/60 border border-cyan-700/50 rounded-2xl p-5 shadow-xl mb-8">
          <p className="text-cyan-300 font-bold text-lg mb-3">🧭 TXN Dominance Explorer</p>
          <input
            type="text"
            placeholder="Search coin (e.g. BTCUSDT)"
            className="w-full p-2 pl-3 pr-10 bg-gray-800 text-gray-200 border border-cyan-700/50 rounded-xl mb-3"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-700/40 bg-gray-800/40">
            {filteredCoins.length > 0 ? (
              filteredCoins.map((coin) => {
                const bullish = coin.priceChangePercent >= 0;
                const coinGreenTxn = bullish ? coin.volume : 0;
                const coinRedTxn = bullish ? 0 : coin.volume;
                const diff = Math.abs(coinGreenTxn - coinRedTxn);
                const dominant = bullish ? "Bullish 🟢" : "Bearish 🔴";
                return (
                  <div key={coin.symbol} className="flex justify-between px-3 py-2 border-b border-gray-700/30 hover:bg-gray-700/30">
                    <div>
                      <p className="font-semibold">{coin.symbol}</p>
                      <p className="text-xs text-gray-400">{dominant} — Gap {formatCompact(diff)} USDT</p>
                    </div>
                    <div className="text-sm">
                      <span className="text-green-400 mr-2">{formatCompact(coinGreenTxn)}</span>
                      <span className="text-red-400">{formatCompact(coinRedTxn)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-400 text-center py-6">No matching coins found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
