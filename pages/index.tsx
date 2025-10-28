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
  spreadPct: number; // ✅ always defined
  signal?: string;
  meaning?: string;
  implication?: string;
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


  // Explorer search state
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // 🧮 Spread Analysis (True Market Tightness + Direction)
const [avgSpreadPct, setAvgSpreadPct] = useState(0);
const [spreadCondition, setSpreadCondition] = useState("—");
const [spreadSentiment, setSpreadSentiment] = useState("—");
  const [spreadExplanation, setSpreadExplanation] = useState("");
const [spreadInterpretation, setSpreadInterpretation] = useState("");

  const [generalBias, setGeneralBias] = useState("—");

  // 🗓️ Weekly Market Bias Tracker
const [weeklyStats, setWeeklyStats] = useState<{
  greens: number;
  reds: number;
  pattern: { bias: string; day: string }[];
  phase: string;
}>({
  greens: 0,
  reds: 0,
  pattern: [],
  phase: "—",
});

useEffect(() => {
  const fetchAllData = async () => {
    setError(null);
    try {
      // 1️⃣ Fetch all required Binance data in parallel
      const [infoRes, tickerRes, fundingRes] = await Promise.all([
        axios.get(`${BINANCE_API}/fapi/v1/exchangeInfo`),
        axios.get(`${BINANCE_API}/fapi/v1/ticker/24hr`),
        axios.get(`${BINANCE_API}/fapi/v1/premiumIndex`),
      ]);

      // ✅ 1. Filter only active Binance Futures (PERPETUAL USDT) pairs
const futuresSymbols = new Set(fundingRes.data.map((f: any) => f.symbol));

// 🧹 2. Manual blacklist to exclude spot-only or delisted tokens
const blacklist = ["ALPACAUSDT", "BNXUSDT", "ALPHAUSDT", "OCEANUSDT", "DGBUSDT", "AGIXUSDT", "LINAUSDT", "LOKAUSDT", "KEYUSDT", "MDTUSDT", "LOOMUDST", "RENUSDT", "OMNIUSDT", "SLERFUSDT", "STMXUSDT"];

// ✅ 3. Keep only valid, tradable perpetual futures pairs
const usdtPairs = infoRes.data.symbols
  .filter(
    (s: any) =>
      s.contractType === "PERPETUAL" &&
      s.symbol.endsWith("USDT") &&
      futuresSymbols.has(s.symbol) &&
      !blacklist.includes(s.symbol)
  )
  .map((s: any) => s.symbol);
      
      const tickerData = tickerRes.data;
      const fundingData = fundingRes.data;

      // 2️⃣ Combine ticker + funding + volume
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

      // 3️⃣ Categorize sentiment buckets
      const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
      const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
      const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
      const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

      // 4️⃣ Liquidity totals (quoteVolume)
      const greenTotal = combinedData
        .filter((d) => d.priceChangePercent >= 0)
        .reduce((sum, d) => sum + d.volume, 0);
      const redTotal = combinedData
        .filter((d) => d.priceChangePercent < 0)
        .reduce((sum, d) => sum + d.volume, 0);

      // 5️⃣ TXN dominance
      const totalGreenTxn = greenTotal;
      const totalRedTxn = redTotal;
      const txnDominantSide =
        totalGreenTxn > totalRedTxn
          ? "🟢 Bullish (Green)"
          : totalRedTxn > totalGreenTxn
          ? "🔴 Bearish (Red)"
          : "⚫ Neutral";

      // 6️⃣ Fetch per-coin order book depth for top 50
      const topPairsForSignals = combinedData
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 50);

      const depthPromisesPerCoin = topPairsForSignals.map((pair) =>
        axios
          .get(`${BINANCE_API}/fapi/v1/depth`, { params: { symbol: pair.symbol, limit: 5 } })
          .then((res) => {
            const bestBid = parseFloat(res.data.bids?.[0]?.[0] || "0");
            const bestAsk = parseFloat(res.data.asks?.[0]?.[0] || "0");
            const mid = (bestBid + bestAsk) / 2;
            const spreadPct = ((bestAsk - bestBid) / mid) * 100;
            return { symbol: pair.symbol, spreadPct };
          })
          .catch(() => ({ symbol: pair.symbol, spreadPct: null }))
      );

      const depthDataPerCoin = await Promise.all(depthPromisesPerCoin);

      // attach spreadPct to each coin
      combinedData = combinedData.map((coin) => {
        const depth = depthDataPerCoin.find((d) => d.symbol === coin.symbol);
        return { ...coin, spreadPct: depth?.spreadPct || 0 };
      });

      // 7️⃣ Classify each coin with Market Tightness Signal
      const SPREAD_TIGHT_PCT = 0.05;
      const SPREAD_WIDE_PCT = 0.15;

      combinedData = combinedData.map((coin) => {
        let signal = "⚫ Neutral";
        let meaning = "Balanced market";
        let implication = "No clear signal";

        const isTight = coin.spreadPct < SPREAD_TIGHT_PCT;
        const isWide = coin.spreadPct >= SPREAD_WIDE_PCT;
        const isBullish = coin.priceChangePercent > 0;
        const isBearish = coin.priceChangePercent < 0;

        if (isTight && isBullish) {
          signal = "🟢 Tight + Bullish";
          meaning = "Demand strong";
          implication = "Accumulation / Early Rally";
        } else if (isTight && isBearish) {
          signal = "🔴 Tight + Bearish";
          meaning = "Supply strong";
          implication = "Distribution / Controlled Sell-off";
        } else if (isWide && isBullish) {
          signal = "🟡 Wide + Bullish";
          meaning = "Reversal";
          implication = "Short squeeze / Volatility spike";
        } else if (isWide && isBearish) {
          signal = "🟠 Wide + Bearish";
          meaning = "Panic";
          implication = "Capitulation phase / Look for bounce soon";
        }

        return { ...coin, signal, meaning, implication };
      });

      // 8️⃣ Spread condition (global)
      let totalSpreadPct = 0;
      let validPairs = 0;
      let upwardTrades = 0;
      let downwardTrades = 0;

      for (const coin of topPairsForSignals) {
        const depth = depthDataPerCoin.find((d) => d.symbol === coin.symbol);
        if (!depth || depth.spreadPct == null) continue;
        totalSpreadPct += depth.spreadPct;
        validPairs++;
        if (coin.priceChangePercent > 0) upwardTrades++;
        else if (coin.priceChangePercent < 0) downwardTrades++;
      }

      const avgSpread = validPairs > 0 ? totalSpreadPct / validPairs : 0;
      setAvgSpreadPct(avgSpread);

      let condition: "Tight" | "Moderate" | "Wide" = "Moderate";
      if (avgSpread < SPREAD_TIGHT_PCT) condition = "Tight";
      else if (avgSpread >= SPREAD_WIDE_PCT) condition = "Wide";
      setSpreadCondition(condition);

      let direction: "Bullish" | "Bearish" | "Neutral" = "Neutral";
      if (upwardTrades > downwardTrades) direction = "Bullish";
      else if (downwardTrades > upwardTrades) direction = "Bearish";

      let explanation = "Mixed liquidity behavior";
      let interpretation = "No clear directional dominance";

      if (condition === "Tight" && direction === "Bullish") {
        explanation = "Demand absorbing all offers";
        interpretation = "Early rally or breakout pressure";
      } else if (condition === "Tight" && direction === "Bearish") {
        explanation = "Supply dominating bids";
        interpretation = "Controlled downtrend / distribution";
      } else if (condition === "Wide" && direction !== "Neutral") {
        explanation = "Market makers step away";
        interpretation = "Fear, liquidation spikes";
      } else if (condition === "Wide" && direction === "Neutral") {
        explanation = "Few traders active";
        interpretation = "Neutral, low-interest phase";
      }

      setSpreadSentiment(
        condition === "Tight"
          ? direction === "Bullish"
            ? "Bullish (Buyers Dominant 🟢)"
            : direction === "Bearish"
            ? "Bearish (Sellers Dominant 🔴)"
            : "Neutral (Tight) ⚫"
          : condition === "Wide"
          ? direction === "Neutral"
            ? "Neutral / Inactive ⚫"
            : "Panic / Uncertain ⚠️"
          : "Moderate / Mixed ⚫"
      );
      setSpreadExplanation(explanation);
      setSpreadInterpretation(interpretation);

      // 9️⃣ Weekly Rhythm Logger
      const today = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila" });
      const weekday = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Manila" });
      const bias = txnDominantSide.includes("Bullish")
        ? "🟩"
        : txnDominantSide.includes("Bearish")
        ? "🟥"
        : "⚫";

      let history = JSON.parse(localStorage.getItem("marketHistory") || "[]");
      const existing = history.find((h: any) => h.date === today);
      if (existing) {
        existing.bias = bias;
        existing.day = weekday;
      } else {
        history.push({ date: today, bias, day: weekday });
      }

      if (history.length > 14) history = history.slice(-14);
      localStorage.setItem("marketHistory", JSON.stringify(history));

      const currentWeek = history.slice(-7);
      const previousWeek = history.slice(-14, -7);
      const greens = currentWeek.filter((h: any) => h.bias === "🟩").length;
      const reds = currentWeek.filter((h: any) => h.bias === "🟥").length;
      const pattern = currentWeek.map((h: any) => ({ bias: h.bias, day: h.day }));

      let phase = "Rotation Phase 🔄";
      if (greens >= 5 && reds <= 2) phase = "Alt Season Building 🌱";
      else if (reds >= 5 && greens <= 2) phase = "Cooling Phase ❄️";
      else if (greens === reds) phase = "Balanced Market ⚖️";

      let trendArrow = "↔ Stable";
      if (previousWeek.length > 0) {
        const prevGreens = previousWeek.filter((h: any) => h.bias === "🟩").length;
        if (greens > prevGreens) trendArrow = "↗ Bullish Momentum Increasing";
        else if (greens < prevGreens) trendArrow = "↘ Bullish Momentum Fading";
      }
      phase = `${phase} • ${trendArrow}`;
      setWeeklyStats({ greens, reds, pattern, phase });

      // 🔟 Overall Market Sentiment Aggregator
      const greenCount = combinedData.filter((d) => d.priceChangePercent >= 0).length;
      const redCount = combinedData.filter((d) => d.priceChangePercent < 0).length;

      let sentimentScore = 0;
      if (greenCount > redCount) sentimentScore += 1;
      else if (redCount > greenCount) sentimentScore -= 1;

      if (greenTotal > redTotal) sentimentScore += 1;
      else if (redTotal > greenTotal) sentimentScore -= 1;

      if (txnDominantSide.includes("Bullish")) sentimentScore += 1;
      else if (txnDominantSide.includes("Bearish")) sentimentScore -= 1;

      if (spreadSentiment.includes("Bullish")) sentimentScore += 1;
      else if (spreadSentiment.includes("Bearish")) sentimentScore -= 1;

      let overallSentiment = "⚫ Neutral / Mixed Market";
      if (sentimentScore >= 2) overallSentiment = "🟢 Bullish Market Bias";
      else if (sentimentScore <= -2) overallSentiment = "🔴 Bearish Market Bias";
      setGeneralBias(overallSentiment);

      // ✅ Save to UI state
      setRawData(combinedData);
      setGreenCount(greenCount);
      setRedCount(redCount);
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

      console.debug("✅ Market data updated", { overallSentiment, condition, avgSpread });
    } catch (err: any) {
      console.error("❌ Error fetching market data:", err);
      setError("Failed to fetch market data.");
    }
  };

  fetchAllData();
  const interval = setInterval(fetchAllData, 60000);
  return () => clearInterval(interval);
}, []);

  // 🟢 Define Top 10 Bullish & 🔴 Top 10 Bearish Lists
const top10Bullish = rawData
  .filter((c) => c.priceChangePercent > 0)
  .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
  .slice(0, 30);

const top10Bearish = rawData
  .filter((c) => c.priceChangePercent < 0)
  .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
  .slice(0, 10);
  

  // Helper to format big numbers to compact (e.g., 1.23B)
  const formatCompact = (n: number) => {
    if (n === null || n === undefined) return "—";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(2);
  };

  // Explorer: filter rawData by search term
  const filteredCoins = rawData
  .filter((d) => d.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase()))
  .map((coin) => {
    const coinGreenTxn = coin.priceChangePercent >= 0 ? coin.volume : 0;
    const coinRedTxn = coin.priceChangePercent < 0 ? coin.volume : 0;
    const diff = Math.abs(coinGreenTxn - coinRedTxn);
    return { ...coin, diff };
  })
  .sort((a, b) => (sortOrder === "desc" ? b.diff - a.diff : a.diff - b.diff))
  .slice(0, 100);

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

              {/* --- Overall Market Bias Summary --- */}
<div className="bg-gray-800/60 border border-cyan-700/30 rounded-xl p-3 mb-3">
  <p className="text-yellow-300 font-semibold mb-1">🧠 Overall Sentiment:</p>
  <p
    className={
      generalBias.includes("Bullish")
        ? "text-green-400 font-bold"
        : generalBias.includes("Bearish")
        ? "text-red-400 font-bold"
        : "text-gray-300 font-bold"
    }
  >
    {generalBias}
  </p>
</div>

              <div className="mt-3 bg-gray-800/60 border border-cyan-700/30 rounded-xl p-3">
  <p className="text-yellow-300 font-semibold mb-2">🗓️ Weekly Market Rhythm</p>

  {/* Visual 7-day bias bar with weekday labels */}
<div className="flex flex-col items-center mb-2">
  <div className="flex items-center gap-1">
    {weeklyStats.pattern.map((entry, i) => (
      <span key={i} className="text-lg">{entry.bias}</span>
    ))}
  </div>
  <div className="flex items-center gap-2 mt-1">
    {weeklyStats.pattern.map((entry, i) => (
      <span key={i} className="text-[10px] text-gray-400">{entry.day}</span>
    ))}
  </div>
</div>

  <p className="text-sm text-gray-300">
    🟢 {weeklyStats.greens} Green Days &nbsp;|&nbsp; 🔴 {weeklyStats.reds} Red Days
  </p>

  <p className="text-xs text-gray-400 mt-1 italic">
    {weeklyStats.phase}
  </p>
</div>

              {/* 24h Price Change */}
    <div className="mt-3 bg-gray-800/50 border border-gray-700 rounded-xl p-3">
    <p className="text-blue-300 font-semibold mb-2">🔄 24h Price Change:</p>  
  ✅ <span className="text-green-400 font-bold">{greenCount}</span> Green &nbsp;&nbsp;  
  ❌ <span className="text-red-400 font-bold">{redCount}</span> Red  
                
  <div className="mt-2">  
  <ul className="text-blue-100 ml-4 list-disc space-y-1">  
    <li>  
      <span className="font-semibold text-green-400">Price Increase (≥ 5%)</span>:{" "}  
      {rawData.filter((item) => item.priceChangePercent >= 5).length}  
    </li>  
    <li>  
      <span className="font-semibold text-yellow-300">Mild Movement (±0–5%)</span>:{" "}  
      {rawData.filter(  
        (item) => item.priceChangePercent > -5 && item.priceChangePercent < 5  
      ).length}  
    </li>  
    <li>  
      <span className="font-semibold text-red-400">Price Drop (≤ -5%)</span>:{" "}  
      {rawData.filter((item) => item.priceChangePercent <= -5).length}  
    </li>  
  </ul>  
</div>
</div>
    </div>

            
{/* --- MARKET TIGHTNESS SUMMARY --- */}
            <div className="mt-3 bg-gray-800/50 border border-gray-700 rounded-xl p-3">
<div className="mt-4">
  <p className="text-yellow-300 font-semibold mb-1">📏 Market Tightness & Sentiment:</p>
  <ul className="text-gray-200 ml-4 list-disc space-y-1">
    <li>
      <span className="text-blue-400 font-semibold">Average Spread:</span>{" "}
      {avgSpreadPct ? avgSpreadPct.toFixed(3) + "%" : "—"}
    </li>
    <li>
      <span className="text-cyan-400 font-semibold">Spread Condition:</span>{" "}
      <span
        className={
          spreadCondition === "Tight"
            ? "text-green-400 font-bold"
            : spreadCondition === "Wide"
            ? "text-red-400 font-bold"
            : "text-yellow-400 font-bold"
        }
      >
        {spreadCondition}
      </span>
    </li>
    <li>
      <span className="text-purple-400 font-semibold">Likely Sentiment:</span>{" "}
      <span
        className={
          spreadSentiment.includes("Bullish")
            ? "text-green-400 font-bold"
            : spreadSentiment.includes("Bearish")
            ? "text-red-400 font-bold"
            : spreadSentiment.includes("Panic")
            ? "text-orange-400 font-bold"
            : "text-gray-300 font-bold"
        }
      >
        {spreadSentiment}
      </span>
    </li>
    {/* --- What's Happening + Interpretation (Enhanced with Icons & Color) --- */}
<li>
  <span className="text-gray-400 font-semibold">What’s Happening:</span>{" "}
  <span
    className={
      spreadExplanation.includes("Demand")
        ? "text-green-400 font-semibold" // bullish
        : spreadExplanation.includes("Supply")
        ? "text-red-400 font-semibold" // bearish
        : spreadExplanation.includes("Market makers")
        ? "text-orange-400 font-semibold" // panic
        : spreadExplanation.includes("Few traders")
        ? "text-yellow-400 font-semibold" // calm
        : "text-gray-300 font-semibold"
    }
  >
    {spreadExplanation.includes("Demand")
      ? "🟢 " + spreadExplanation
      : spreadExplanation.includes("Supply")
      ? "🔴 " + spreadExplanation
      : spreadExplanation.includes("Market makers")
      ? "⚠️ " + spreadExplanation
      : spreadExplanation.includes("Few traders")
      ? "😴 " + spreadExplanation
      : "⚫ " + spreadExplanation}
  </span>
</li>

<li>
  <span className="text-gray-400 font-semibold">Interpretation:</span>{" "}
  <span
    className={
      spreadInterpretation.includes("rally") ||
      spreadInterpretation.includes("breakout")
        ? "text-green-400 font-semibold"
        : spreadInterpretation.includes("downtrend") ||
          spreadInterpretation.includes("distribution")
        ? "text-red-400 font-semibold"
        : spreadInterpretation.includes("Fear")
        ? "text-orange-400 font-semibold"
        : spreadInterpretation.includes("Neutral")
        ? "text-yellow-400 font-semibold"
        : "text-gray-300 font-semibold"
    }
  >
    {spreadInterpretation.includes("rally") ||
    spreadInterpretation.includes("breakout")
      ? "🟢 " + spreadInterpretation
      : spreadInterpretation.includes("downtrend") ||
        spreadInterpretation.includes("distribution")
      ? "🔴 " + spreadInterpretation
      : spreadInterpretation.includes("Fear")
      ? "⚠️ " + spreadInterpretation
      : spreadInterpretation.includes("Neutral")
      ? "😴 " + spreadInterpretation
      : "⚫ " + spreadInterpretation}
  </span>
</li>
  </ul>
</div>
      </div>
          

            {/* --- TXN DOMINANCE CARD (like ATH gap) --- */}
            <div className="bg-gray-800/50 border border-cyan-700/40 rounded-2xl p-4 shadow-sm mt-2">

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
              
              <p className="text-cyan-300 font-bold text-lg mb-2 mt-3 flex items-center gap-2">
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

          <div className="flex justify-end mb-3">
  <button
    onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
    className="text-xs text-cyan-300 border border-cyan-700/50 px-3 py-1 rounded-lg hover:bg-cyan-700/30 transition"
  >
    Sort by Gap: {sortOrder === "desc" ? "↓ Descending" : "↑ Ascending"}
  </button>
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

                return (
                  <div
                    key={coin.symbol}
                    className="flex justify-between items-center px-3 py-2 border-b border-gray-700/30 hover:bg-gray-700/30 transition-all cursor-pointer"
                  >
                    <div>
                      <p className="font-semibold text-gray-200">{coin.symbol}</p>
                      <p className="text-xs text-gray-400">
                        {dominant} — Gap {formatCompact(diff)} USDT
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

           {/* Top 10 lists */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-green-400 font-semibold mb-3">🟢 Top 10 Bullish (24h)</h3>
                <ul className="space-y-2">
                  {top10Bullish.map((coin, i) => (
                    <li key={coin.symbol} className="p-3 border border-green-700/20 bg-green-900/6 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-gray-200">{i + 1}. {coin.symbol}</div>
                          <div className="text-xs text-gray-400 mt-1">{coin.signal} — {coin.meaning}</div>
                          <div className="text-xs text-gray-500 mt-1">{coin.implication}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-bold">{coin.priceChangePercent.toFixed(2)}%</div>
                          <div className="text-xs text-gray-400 mt-1">Funding: {coin.fundingRate.toFixed(6)}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{formatCompact(coin.volume)} USDT</div>
                          <div className="text-xs text-gray-400 mt-0.5">Spread: {(coin.spreadPct ?? 0).toFixed(3)}%</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-red-400 font-semibold mb-3">🔴 Top 10 Bearish (24h)</h3>
                <ul className="space-y-2">
                  {top10Bearish.map((coin, i) => (
                    <li key={coin.symbol} className="p-3 border border-red-700/20 bg-red-900/6 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-gray-200">{i + 1}. {coin.symbol}</div>
                          <div className="text-xs text-gray-400 mt-1">{coin.signal} — {coin.meaning}</div>
                          <div className="text-xs text-gray-500 mt-1">{coin.implication}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-red-400 font-bold">{coin.priceChangePercent.toFixed(2)}%</div>
                          <div className="text-xs text-gray-400 mt-1">Funding: {coin.fundingRate.toFixed(6)}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{formatCompact(coin.volume)} USDT</div>
                          <div className="text-xs text-gray-400 mt-0.5">Spread: {(coin.spreadPct ?? 0).toFixed(3)}%</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
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
