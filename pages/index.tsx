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
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
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

  // 🧭 Transaction Dominance (Executed Trade Flow totals)
  const [greenTxn, setGreenTxn] = useState(0);
  const [redTxn, setRedTxn] = useState(0);
  const [txnDominant, setTxnDominant] = useState("");

  // 🔺 AMPL Dominance (new)
  const [bullishAmplWeighted, setBullishAmplWeighted] = useState(0);
  const [bearishAmplWeighted, setBearishAmplWeighted] = useState(0);
  const [amplDominant, setAmplDominant] = useState("");
  const [amplBullPct, setAmplBullPct] = useState(0);
  const [amplBearPct, setAmplBearPct] = useState(0);

  // Explorer search state
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchAllData = async () => {
      setError(null);
      try {
        // Fetch core endpoints
        const [infoRes, tickerRes, fundingRes] = await Promise.all([
          axios.get(`${BINANCE_API}/fapi/v1/exchangeInfo`),
          axios.get(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          axios.get(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const usdtPairs = infoRes.data.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        const tickerData = tickerRes.data; // array of tickers (includes openPrice, highPrice, lowPrice, lastPrice, quoteVolume, priceChangePercent)
        const fundingData = fundingRes.data;

        // Build combined data including OHLC-ish fields from 24hr ticker
        let combinedData: SymbolData[] = usdtPairs
          .map((symbol: string) => {
            const ticker = tickerData.find((t: any) => t.symbol === symbol);
            const funding = fundingData.find((f: any) => f.symbol === symbol);
            return {
              symbol,
              priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
              fundingRate: parseFloat(funding?.lastFundingRate || "0"),
              lastPrice: parseFloat(ticker?.lastPrice || "0"),
              volume: parseFloat(ticker?.quoteVolume || "0"), // quoteVolume is USDT notional
              openPrice: parseFloat(ticker?.openPrice || "0"),
              highPrice: parseFloat(ticker?.highPrice || "0"),
              lowPrice: parseFloat(ticker?.lowPrice || "0"),
              closePrice: parseFloat(ticker?.lastPrice || 0),
            };
          })
          .filter((d: SymbolData) => d.volume > 0 && d.openPrice > 0);

        // 🌿 Categorize data (funding/price change combos)
        const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        // 💧 Liquidity totals (by quote volume)
        const greenTotal = combinedData
          .filter((d) => d.priceChangePercent >= 0)
          .reduce((sum, d) => sum + d.volume, 0);
        const redTotal = combinedData
          .filter((d) => d.priceChangePercent < 0)
          .reduce((sum, d) => sum + d.volume, 0);

        // 🧭 Transaction Dominance (Executed Flow) — using quoteVolume as proxy for txn notional
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

        // 🔺 AMPL Dominance computation (Option 1: use 24h ticker open/high/low/close)
        // We'll compute amplitude% = ((high - low) / open) * 100
        // Then weight amplitude by volume so big-volume coins influence dominance more.
        let bullAmplWeighted = 0;
        let bearAmplWeighted = 0;
        let amplTotalWeighted = 0;

        combinedData.forEach((d) => {
          const { openPrice, highPrice, lowPrice, closePrice, volume } = d;
          if (!openPrice || openPrice <= 0) return;
          const amplPercent = ((highPrice - lowPrice) / openPrice) * 100; // amplitude percent
          const weighted = amplPercent * volume; // ampl% * quoteVolume -> larger for big tickers
          amplTotalWeighted += weighted;
          if (closePrice > openPrice) {
            bullAmplWeighted += weighted;
          } else if (closePrice < openPrice) {
            bearAmplWeighted += weighted;
          } else {
            // neutral candle: split evenly (optional)
            // bullAmplWeighted += weighted/2;
            // bearAmplWeighted += weighted/2;
          }
        });

        const amplDominantSide =
          bullAmplWeighted > bearAmplWeighted
            ? "🟢 Bullish AMPL Dominance"
            : bearAmplWeighted > bullAmplWeighted
            ? "🔴 Bearish AMPL Dominance"
            : "⚫ Neutral AMPL";

        const bullPct = amplTotalWeighted > 0 ? (bullAmplWeighted / amplTotalWeighted) * 100 : 0;
        const bearPct = amplTotalWeighted > 0 ? (bearAmplWeighted / amplTotalWeighted) * 100 : 0;

        // 🧾 Update states
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
          greenTotal > redTotal ? "Bullish Liquidity (Green)" :
          redTotal > greenTotal ? "Bearish Liquidity (Red)" : "Balanced"
        );

        setGreenTxn(totalGreenTxn);
        setRedTxn(totalRedTxn);
        setTxnDominant(txnDominantSide);

        setBullishAmplWeighted(bullAmplWeighted);
        setBearishAmplWeighted(bearAmplWeighted);
        setAmplDominant(amplDominantSide);
        setAmplBullPct(parseFloat(bullPct.toFixed(2)));
        setAmplBearPct(parseFloat(bearPct.toFixed(2)));

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

  // Helper to format big numbers to compact (e.g., 1.23B)
  const formatCompact = (n: number) => {
    if (n === null || n === undefined) return "—";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(2);
  };

  // Explorer: filter rawData by search term (defensive)
  const filteredCoins = rawData
    .filter((d) => d?.symbol && d.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    .slice(0, 100); // cap to 100 results to avoid heavy lists

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
                  {formatCompact(greenLiquidity)} USDT
                </li>
                <li>
                  <span className="text-red-400 font-semibold">Total Red Liquidity:</span>{" "}
                  {formatCompact(redLiquidity)} USDT
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

            {/* --- TXN DOMINANCE CARD (like ATH gap) --- */}
            <div className="bg-gray-800/50 border border-cyan-700/40 rounded-2xl p-4 shadow-sm mt-2">
              <p className="text-cyan-300 font-bold text-lg mb-2 flex items-center gap-2">
                🧭 Transaction Dominance
                <span className="text-xs text-gray-400 font-normal">(Executed Trade Flow)</span>
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-gray-100 text-sm">
                <div className="bg-green-800/20 border border-green-600/20 rounded-xl p-3 text-center">
                  <p className="text-green-400 font-semibold">Bullish TXN</p>
                  <p className="text-xl font-bold">{formatCompact(greenTxn)}</p>
                  <p className="text-xs text-gray-400">USDT Volume</p>
                </div>

                <div className="bg-red-800/20 border border-red-600/20 rounded-xl p-3 text-center">
                  <p className="text-red-400 font-semibold">Bearish TXN</p>
                  <p className="text-xl font-bold">{formatCompact(redTxn)}</p>
                  <p className="text-xs text-gray-400">USDT Volume</p>
                </div>

                <div className="bg-yellow-800/10 border border-yellow-600/20 rounded-xl p-3 text-center">
                  <p className="text-yellow-300 font-semibold">Gap Difference</p>
                  <p className="text-xl font-bold">{formatCompact(Math.abs(greenTxn - redTxn))}</p>
                  <p className="text-xs text-gray-400">
                    {greenTxn > redTxn ? "Favoring Bulls 🟢" : redTxn > greenTxn ? "Favoring Bears 🔴" : "Balanced ⚫"}
                  </p>
                </div>

                <div
                  className={`rounded-xl p-3 text-center border ${
                    txnDominant.includes("Bullish")
                      ? "border-green-500/40 bg-green-900/20"
                      : txnDominant.includes("Bearish")
                      ? "border-red-500/40 bg-red-900/20"
                      : "border-yellow-500/40 bg-yellow-900/20"
                  }`}
                >
                  <p className="font-semibold text-gray-300">Dominant Side</p>
                  <p
                    className={`text-xl font-bold ${
                      txnDominant.includes("Bullish")
                        ? "text-green-400"
                        : txnDominant.includes("Bearish")
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {txnDominant}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Based on TXN Volume</p>
                </div>
              </div>
            </div>

            {/* --- AMPL DOMINANCE CARD (new) --- */}
            <div className="bg-gray-800/50 border border-indigo-700/40 rounded-2xl p-4 shadow-sm mt-2">
              <p className="text-indigo-300 font-bold text-lg mb-2 flex items-center gap-2">
                🔺 AMPL Dominance
                <span className="text-xs text-gray-400 font-normal">(Volume-weighted volatility)</span>
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-gray-100 text-sm">
                <div className="bg-green-800/20 border border-green-600/20 rounded-xl p-3 text-center">
                  <p className="text-green-400 font-semibold">Bullish Ampl (weighted)</p>
                  <p className="text-xl font-bold">{formatCompact(bullishAmplWeighted)}</p>
                  <p className="text-xs text-gray-400">{amplBullPct}%</p>
                </div>

                <div className="bg-red-800/20 border border-red-600/20 rounded-xl p-3 text-center">
                  <p className="text-red-400 font-semibold">Bearish Ampl (weighted)</p>
                  <p className="text-xl font-bold">{formatCompact(bearishAmplWeighted)}</p>
                  <p className="text-xs text-gray-400">{amplBearPct}%</p>
                </div>

                <div className="bg-yellow-800/10 border border-yellow-600/20 rounded-xl p-3 text-center">
                  <p className="text-yellow-300 font-semibold">Gap Diff (weighted)</p>
                  <p className="text-xl font-bold">{formatCompact(Math.abs(bullishAmplWeighted - bearishAmplWeighted))}</p>
                  <p className="text-xs text-gray-400">
                    {bullishAmplWeighted > bearishAmplWeighted ? "Volatility favors Bulls" : bearishAmplWeighted > bullishAmplWeighted ? "Volatility favors Bears" : "Balanced"}
                  </p>
                </div>

                <div className="rounded-xl p-3 text-center border border-gray-600">
                  <p className="text-gray-300 font-semibold">Dominant AMPL Side</p>
                  <p className={`text-xl font-bold ${amplDominant.includes("Bullish") ? "text-green-400" : amplDominant.includes("Bearish") ? "text-red-400" : "text-yellow-400"}`}>
                    {amplDominant}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Based on amplitude × volume</p>
                </div>
              </div>
            </div>

            {/* --- Explorer heading + search will be rendered below --- */}
          </div>
        </div>

        {/* --- TXN DOMINANCE EXPLORER (search + list) --- */}
        <div className="bg-gray-900/60 border border-cyan-700/50 rounded-2xl p-5 shadow-xl mb-8">
          <p className="text-cyan-300 font-bold text-lg mb-3 flex items-center gap-2">
            🧭 TXN Dominance Explorer
            <span className="text-xs text-gray-400 font-normal">(Search coin to see TXN side)</span>
          </p>

          {/* Search Input */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search coin (e.g., BTCUSDT)"
              className="w-full p-2 pl-3 pr-10 bg-gray-800 text-gray-200 border border-cyan-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute top-2 right-3 text-gray-400">🔍</div>
          </div>

          {/* Filtered Coins List */}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-700/40 bg-gray-800/40">
            {filteredCoins.length > 0 ? (
              filteredCoins.map((coin) => {
                // For a single coin, determine whether its executed txn volume is considered bullish or bearish.
                // Here we treat the coin as bullish TXN if priceChangePercent >= 0 (i.e., net buyers), else bearish.
                const coinGreenTxn = coin.priceChangePercent >= 0 ? coin.volume : 0;
                const coinRedTxn = coin.priceChangePercent < 0 ? coin.volume : 0;
                const diff = Math.abs(coinGreenTxn - coinRedTxn);
                const dominant = coinGreenTxn > coinRedTxn ? "Bullish 🟢" : coinRedTxn > coinGreenTxn ? "Bearish 🔴" : "Neutral ⚫";

                // also show per-coin amplitude percent for reference
                const amplPercent = coin.openPrice && coin.openPrice > 0 ? ((coin.highPrice - coin.lowPrice) / coin.openPrice) * 100 : 0;
                const amplSign = coin.closePrice > coin.openPrice ? "↑" : coin.closePrice < coin.openPrice ? "↓" : "—";

                return (
                  <div
                    key={coin.symbol}
                    className="flex justify-between items-center px-3 py-2 border-b border-gray-700/30 hover:bg-gray-700/30 transition-all cursor-pointer"
                  >
                    <div>
                      <p className="font-semibold text-gray-200">{coin.symbol}</p>
                      <p className="text-xs text-gray-400">
                        {dominant} — TXN Gap {formatCompact(diff)} USDT — AMPL {amplPercent.toFixed(2)}% {amplSign}
                      </p>
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
          <p className="mt-1">
            <a href="https://github.com/yourusername/yourrepo" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white hover:underline">
              View Source on GitHub
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
