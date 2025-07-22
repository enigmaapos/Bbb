import { useEffect, useState } from "react";
// Import the new component from the CORRECT path (assuming it's in a 'components' folder)
import FundingSentimentChart from "../components/FundingSentimentChart"; 

const BINANCE_API = "https://fapi.binance.com";

type SRStatus = "above_resistance" | "at_resistance" | "between" | "at_support" | "below_support" | "unknown";

type SymbolData = {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  majorResistance?: number;
  majorSupport?: number;
  srStatus?: SRStatus;
  rsi14?: number[]; // Add RSI array
  rsiSignal?: string; // Add RSI signal string
};

type SymbolTradeSignal = {
  symbol: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  signal: "long" | "short" | null;
  isValidatedBySR?: boolean;
  srReason?: string;
};

// --- REAL SUPPORT/RESISTANCE FUNCTION ---
// This function fetches historical kline data to identify S/R levels.
type SRLevels = {
  majorResistance: number;
  majorSupport: number;
  srStatus: SRStatus;
  closePrices: number[]; // Return close prices for RSI calculation
};

const getRealSupportResistanceStatus = async (
  symbol: string,
  currentPrice: number
): Promise<SRLevels> => {
  try {
    const response = await fetch(
      `${BINANCE_API}/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=150`
    );
    const rawData = await response.json();

    if (!rawData || rawData.length === 0) {
      return {
        majorResistance: 0,
        majorSupport: 0,
        srStatus: "unknown",
        closePrices: [], // No data, no close prices
      };
    }

    const highs = rawData.map((k: any) => parseFloat(k[2])); // Highs (index 2 in kline array)
    const lows = rawData.map((k: any) => parseFloat(k[3]));  // Lows (index 3 in kline array)
    const closePrices = rawData.map((k: any) => parseFloat(k[4])); // Close (index 4 in kline array)

    const recentHighs = highs.slice(-50); // Consider last 50 days for recent highs
    const resistance = Math.max(...recentHighs);

    const recentLows = lows.slice(-50); // Consider last 50 days for recent lows
    const support = Math.min(...recentLows);

    let status: SRStatus = "unknown";
    const buffer = currentPrice * 0.005; // 0.5% buffer for "at" levels

    if (currentPrice >= resistance - buffer && currentPrice <= resistance + buffer) {
      status = "at_resistance";
    } else if (currentPrice > resistance + buffer) {
      status = "above_resistance";
    } else if (currentPrice <= support + buffer && currentPrice >= support - buffer) {
      status = "at_support";
    } else if (currentPrice < support - buffer) {
      status = "below_support";
    } else {
      status = "between";
    }

    return { majorResistance: resistance, majorSupport: support, srStatus: status, closePrices: closePrices };
  } catch (error) {
    console.error(`SR error for ${symbol}:`, error);
    return {
      majorResistance: 0,
      majorSupport: 0,
      srStatus: "unknown",
      closePrices: [],
    };
  }
};

// --- RSI Calculation Helper Functions ---
function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period) return [];

  let changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let gains: number[] = changes.map(c => Math.max(0, c));
  let losses: number[] = changes.map(c => Math.abs(Math.min(0, c)));

  let avgGain: number[] = [];
  let avgLoss: number[] = [];

  // Initial average gain/loss
  let sumGain = gains.slice(0, period).reduce((a, b) => a + b, 0);
  let sumLoss = losses.slice(0, period).reduce((a, b) => a + b, 0);

  avgGain.push(sumGain / period);
  avgLoss.push(sumLoss / period);

  // Wilder's smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain.push((avgGain[avgGain.length - 1] * (period - 1) + gains[i]) / period);
    avgLoss.push((avgLoss[avgLoss.length - 1] * (period - 1) + losses[i]) / period);
  }

  let rsiValues: number[] = [];
  for (let i = 0; i < avgGain.length; i++) {
    let rs = avgGain[i] / avgLoss[i];
    if (avgLoss[i] === 0) { // Handle division by zero for RS
      rs = Infinity;
    }
    rsiValues.push(100 - (100 / (1 + rs)));
  }

  // RSI array will be shorter than prices by 'period'
  // We need to pad it with nulls or undefined to align with price array if full length is needed
  // For simplicity, we'll return the calculated RSI values as is.
  return rsiValues;
}

function getRecentRSIDiff(rsi: number[], lookback = 14) {
  if (rsi.length < lookback) return null;

  const recentRSI = rsi.slice(-lookback);
  let recentHigh = -Infinity;
  let recentLow = Infinity;

  for (const value of recentRSI) {
    if (value !== undefined && !isNaN(value)) { // Ensure value is a valid number
      if (value > recentHigh) recentHigh = value;
      if (value < recentLow) recentLow = value;
    }
  }

  // If recentHigh or recentLow remained at initial (unlikely for valid RSI, but for safety)
  if (recentHigh === -Infinity || recentLow === Infinity) return null;


  const pumpStrength = recentHigh - recentLow;
  const dumpStrength = Math.abs(recentLow - recentHigh); // This seems redundant if pumpStrength captures the range

  const startRSI = recentRSI[0];
  const endRSI = recentRSI[recentRSI.length - 1];
  const direction = endRSI > startRSI ? 'pump' : endRSI < startRSI ? 'dump' : 'neutral';
  const strength = Math.abs(endRSI - startRSI);

  return {
    recentHigh,
    recentLow,
    pumpStrength, // Max range within lookback
    dumpStrength: pumpStrength, // Re-using pumpStrength as it's the total range
    direction, // Direction from start to end of lookback window
    strength // Absolute difference between start and end RSI in lookback window
  };
}

const getRsiSignal = (s: SymbolData): string => {
  if (!s.rsi14 || s.rsi14.length === 0) return 'NO DATA';

  const pumpDump = getRecentRSIDiff(s.rsi14, 14);
  if (!pumpDump) return 'NO DATA';

  const { direction, pumpStrength, dumpStrength } = pumpDump;

  const isAboveThreshold = (val: number | undefined, threshold: number) =>
    val !== undefined && val >= threshold;

  // Define a threshold for "strong" pump/dump in RSI
  const RSI_SIGNAL_THRESHOLD = 30; // RSI move of 30 points

  if (direction === 'pump' && isAboveThreshold(pumpStrength, RSI_SIGNAL_THRESHOLD)) {
    // Check if current RSI is high enough to be "overbought" for a pump zone
    const latestRSI = s.rsi14[s.rsi14.length - 1];
    if (latestRSI > 70) { // Example: RSI over 70 for pump
      return 'MAX ZONE PUMP (OVERSOLD)'; // Changed from 'MAX ZONE PUMP' for clearer meaning
    } else {
      return 'RSI PUMPING';
    }
  }

  if (direction === 'dump' && isAboveThreshold(dumpStrength, RSI_SIGNAL_THRESHOLD)) {
    // Check if current RSI is low enough to be "oversold" for a dump zone
    const latestRSI = s.rsi14[s.rsi14.length - 1];
    if (latestRSI < 30) { // Example: RSI below 30 for dump
      return 'MAX ZONE DUMP (OVERBOUGHT)'; // Changed from 'MAX ZONE DUMP' for clearer meaning
    } else {
      return 'RSI DUMPING';
    }
  }

  // Additional conditions for neutrality or specific ranges
  const latestRSI = s.rsi14[s.rsi14.length - 1];
  if (latestRSI > 70) return 'OVERBOUGHT';
  if (latestRSI < 30) return 'OVERSOLD';
  if (latestRSI >= 45 && latestRSI <= 55) return 'NEUTRAL';


  return 'NORMAL'; // Default or no clear signal
};


export default function PriceFundingTracker() {
  const [data, setData] = useState<SymbolData[]>([]);
  const [tradeSignals, setTradeSignals] = useState<SymbolTradeSignal[]>([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [greenPositiveFunding, setGreenPositiveFunding] = useState(0);
  const [greenNegativeFunding, setGreenNegativeFunding] = useState(0);
  const [redPositiveFunding, setRedPositiveFunding] = useState(0);
  const [redNegativeFunding, setRedNegativeFunding] = useState(0);
  const [priceUpFundingNegativeCount, setPriceUpFundingNegativeCount] = useState(0);
  const [priceDownFundingPositiveCount, setPriceDownFundingPositiveCount] = useState(0);
  const [sortBy, setSortBy] = useState<"fundingRate" | "priceChangePercent" | "rsiSignal">("fundingRate"); // Add rsiSignal to sort options
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBySignal, setSortBySignal] = useState<"asc" | "desc" | null>(null);

  // New states for RSI signal counts
  const [maxZonePumpCount, setMaxZonePumpCount] = useState(0);
  const [maxZoneDumpCount, setMaxZoneDumpCount] = useState(0);

  const [fundingImbalanceData, setFundingImbalanceData] = useState({
    priceUpShortsPaying: 0,
    priceUpLongsPaying: 0,
    priceDownLongsPaying: 0,
    priceDownShortsPaying: 0,
    topShortSqueeze: [] as SymbolData[],
    topLongTrap: [] as SymbolData[],
  });

  // Generate trade signals based on priceChangePercent, fundingRate, and S/R
  const generateTradeSignals = (combinedData: SymbolData[]): SymbolTradeSignal[] => {
    return combinedData.map(({ symbol, priceChangePercent, fundingRate, lastPrice, srStatus }) => {
      let signal: "long" | "short" | null = null;
      let entry: number | null = null;
      let stopLoss: number | null = null;
      let takeProfit: number | null = null;
      let isValidatedBySR: boolean = false;
      let srReason: string = "";

      // Bullish Entry Signal: Price up (or neutral) and Funding Rate negative (shorts paying)
      if (priceChangePercent >= 0 && fundingRate < 0) {
        signal = "long";
        entry = lastPrice;
        // Example logic: SL 0.5x of price change, TP 1.5x of price change
        stopLoss = entry - (Math.abs(priceChangePercent) / 100) * entry * 0.5;
        takeProfit = entry + (Math.abs(priceChangePercent) / 100) * entry * 1.5;

        // Validate long signal with S/R
        if (srStatus === "at_support" || srStatus === "below_support" || srStatus === "between") {
          isValidatedBySR = true;
          srReason = srStatus === "at_support" ? "Near Major Support" : srStatus === "below_support" ? "Below Major Support (potential reversal)" : "Between S/R";
        } else if (srStatus === "at_resistance" || srStatus === "above_resistance") {
          isValidatedBySR = false; // Long near resistance could be risky
          srReason = srStatus === "at_resistance" ? "Near Major Resistance (potential reversal)" : "Above Major Resistance (possible overextension)";
        }
      }

      // Bearish Entry Signal: Price down and Funding Rate positive (longs paying)
      if (priceChangePercent < 0 && fundingRate > 0) {
        signal = "short";
        entry = lastPrice;
        // Example logic: SL 0.5x of price change, TP 1.5x of price change
        stopLoss = entry + (Math.abs(priceChangePercent) / 100) * entry * 0.5;
        takeProfit = entry - (Math.abs(priceChangePercent) / 100) * entry * 1.5;

        // Validate short signal with S/R
        if (srStatus === "at_resistance" || srStatus === "above_resistance" || srStatus === "between") {
          isValidatedBySR = true;
          srReason = srStatus === "at_resistance" ? "Near Major Resistance" : srStatus === "above_resistance" ? "Above Major Resistance (potential reversal)" : "Between S/R";
        } else if (srStatus === "at_support" || srStatus === "below_support") {
          isValidatedBySR = false; // Short near support could be risky
          srReason = srStatus === "at_support" ? "Near Major Support (potential bounce)" : "Below Major Support (possible oversold)";
        }
      }

      return { symbol, entry, stopLoss, takeProfit, signal, isValidatedBySR, srReason };
    });
  };

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
        const fundingData = await fundingData.json();

        // Prepare initial combined data
        const initialCombinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t: any) => t.symbol === symbol);
          const funding = fundingData.find((f: any) => f.symbol === symbol);
          const lastPrice = parseFloat(ticker?.lastPrice || "0");

          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
            lastPrice: lastPrice,
            majorResistance: 0,
            majorSupport: 0,
            srStatus: "unknown",
            rsi14: [], // Initialize RSI
            rsiSignal: "NO DATA", // Initialize RSI signal
          };
        });

        // Fetch S/R and Close Prices concurrently for all symbols
        const srPromises = initialCombinedData.map(async (item) => {
          const srData = await getRealSupportResistanceStatus(item.symbol, item.lastPrice);
          const rsiValues = calculateRSI(srData.closePrices); // Calculate RSI here
          const rsiSignal = getRsiSignal({ ...item, rsi14: rsiValues }); // Get RSI signal
          return { ...item, ...srData, rsi14: rsiValues, rsiSignal: rsiSignal };
        });

        const combinedDataWithSRAndRSI: SymbolData[] = await Promise.all(srPromises);

        // Update counts for stats
        const green = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent >= 0).length;
        const red = combinedDataWithSRAndRSI.length - green;
        setGreenCount(green);
        setRedCount(red);

        const gPos = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        setGreenPositiveFunding(gPos);
        setGreenNegativeFunding(gNeg);
        setRedPositiveFunding(rPos);
        setRedNegativeFunding(rNeg);

        const priceUpFundingNegative = combinedDataWithSRAndRSI.filter(
          (d) => d.priceChangePercent > 0 && d.fundingRate < 0
        ).length;
        const priceDownFundingPositive = combinedDataWithSRAndRSI.filter(
          (d) => d.priceChangePercent < 0 && d.fundingRate > 0
        ).length;

        setPriceUpFundingNegativeCount(priceUpFundingNegative);
        setPriceDownFundingPositiveCount(priceDownFundingPositive);

        // Calculate RSI signal counts
        const pumpCount = combinedDataWithSRAndRSI.filter(d => d.rsiSignal === 'MAX ZONE PUMP (OVERSOLD)' || d.rsiSignal === 'RSI PUMPING').length;
        const dumpCount = combinedDataWithSRAndRSI.filter(d => d.rsiSignal === 'MAX ZONE DUMP (OVERBOUGHT)' || d.rsiSignal === 'RSI DUMPING').length;
        setMaxZonePumpCount(pumpCount);
        setMaxZoneDumpCount(dumpCount);


        // Calculate funding imbalance data
        const priceUpShortsPaying = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0).length;
        const priceUpLongsPaying = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent > 0 && d.fundingRate > 0).length;
        const priceDownLongsPaying = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0).length;
        const priceDownShortsPaying = combinedDataWithSRAndRSI.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        const topShortSqueeze = combinedDataWithSRAndRSI
          .filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0)
          .sort((a, b) => a.fundingRate - b.fundingRate) // More negative funding rate means stronger squeeze potential
          .slice(0, 5);

        const topLongTrap = combinedDataWithSRAndRSI
          .filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0)
          .sort((a, b) => b.fundingRate - a.fundingRate) // More positive funding rate means stronger trap
          .slice(0, 5);

        setFundingImbalanceData({
          priceUpShortsPaying,
          priceUpLongsPaying,
          priceDownLongsPaying,
          priceDownShortsPaying,
          topShortSqueeze,
          topLongTrap,
        });

        const signals = generateTradeSignals(combinedDataWithSRAndRSI);
        setTradeSignals(signals);

        // Sorting logic based on current sort settings
        const sorted = [...combinedDataWithSRAndRSI].sort((a, b) => {
          // Priority to signal sorting if active
          if (sortBySignal !== null) {
            const signalA = signals.find((s) => s.symbol === a.symbol);
            const signalB = signals.find((s) => s.symbol === b.symbol);

            // Define rank for signals: long validated (0), short validated (1), long (2), short (3), null (4)
            const rank = (s: SymbolTradeSignal | undefined) => {
              if (s?.signal === "long" && s?.isValidatedBySR) return 0;
              if (s?.signal === "short" && s?.isValidatedBySR) return 1;
              if (s?.signal === "long") return 2;
              if (s?.signal === "short") return 3;
              return 4;
            };

            const rankA = rank(signalA);
            const rankB = rank(signalB);

            return sortBySignal === "asc" ? rankA - rankB : rankB - rankA;
          }

          // Fallback to other sorts
          if (sortBy === "rsiSignal") {
            // Custom sorting for RSI Signal: Prioritize 'MAX ZONE PUMP' then 'MAX ZONE DUMP', etc.
            const rsiRank = (signal: string | undefined) => {
              if (signal === 'MAX ZONE PUMP (OVERSOLD)') return 0;
              if (signal === 'RSI PUMPING') return 1;
              if (signal === 'MAX ZONE DUMP (OVERBOUGHT)') return 2;
              if (signal === 'RSI DUMPING') return 3;
              if (signal === 'OVERBOUGHT') return 4;
              if (signal === 'OVERSOLD') return 5;
              if (signal === 'NEUTRAL') return 6;
              if (signal === 'NORMAL') return 7;
              return 8; // 'NO DATA' or unknown
            };
            const rankA = rsiRank(a.rsiSignal);
            const rankB = rsiRank(b.rsiSignal);
            return sortOrder === "asc" ? rankA - rankB : rankB - rankA;
          } else if (sortBy === "fundingRate") {
            return sortOrder === "desc" ? b.fundingRate - a.fundingRate : a.fundingRate - b.fundingRate;
          } else { // priceChangePercent
            return sortOrder === "desc" ? b.priceChangePercent - a.priceChangePercent : a.priceChangePercent - b.priceChangePercent;
          }
        });

        setData(sorted);
      } catch (err) {
        console.error("Error fetching Binance data:", err);
        // Optionally, handle error state in UI
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval); // Cleanup on unmount
  }, [sortBy, sortOrder, sortBySignal]); // Dependencies updated

  const getSentimentClue = () => {
    const total = greenCount + redCount;
    if (total === 0) return "⚪ Neutral: No clear edge, stay cautious";

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
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📈 Binance USDT Perpetual Tracker</h1>

        <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">
            📊 Market Summary
            <span
              title="Tracks how price movement and funding rate interact across all perpetual USDT pairs"
              className="text-sm text-gray-400 ml-2 cursor-help"
            >
              ℹ️
            </span>
          </h2>

          <div className="text-sm space-y-4">
            {/* 🧮 General Market Bias */}
            <div>
              <p className="text-gray-400 font-semibold mb-1">🧮 General Market Bias:</p>
              ✅ <span className="text-green-400 font-bold">Green</span>: {greenCount} &nbsp;&nbsp;
              ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}
            </div>

            {/* 🔄 24h Price Change Breakdown */}
            <div>
              <p className="text-blue-300 font-semibold mb-1">🔄 24h Price Change:</p>
              <ul className="text-blue-100 ml-4 list-disc space-y-1">
                <li><span className="font-semibold text-green-400">Price Increase (≥ 5%)</span>: {
                  data.filter((item) => item.priceChangePercent >= 5).length
                }</li>
                <li><span className="font-semibold text-yellow-300">Mild Movement (±0–5%)</span>: {
                  data.filter((item) => item.priceChangePercent > -5 && item.priceChangePercent < 5).length
                }</li>
                <li><span className="font-semibold text-red-400">Price Drop (≤ -5%)</span>: {
                  data.filter((item) => item.priceChangePercent <= -5).length
                }</li>
              </ul>
            </div>

            {/* 📈 Bullish Potential from Short Squeeze */}
            <div>
              <p className="text-green-300 font-semibold mb-1">📈 Bullish Potential (Shorts Paying):</p>
              <span className="text-green-400">Green + Funding ➕:</span>{" "}
              <span className="text-green-300 font-bold">{greenPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-red-400">➖:</span>{" "}
              <span className="text-red-300 font-bold">{greenNegativeFunding}</span>
            </div>

            {/* 📉 Bearish Pressure from Long Trap */}
            <div>
              <p className="text-red-300 font-semibold mb-1">📉 Bearish Risk (Longs Paying):</p>
              <span className="text-red-400">Red + Funding ➕:</span>{" "}
              <span className="text-green-300 font-bold">{redPositiveFunding}</span> &nbsp;|&nbsp;
              <span className="text-yellow-300">➖:</span>{" "}
              <span className="text-red-200 font-bold">{redNegativeFunding}</span>
            </div>

            {/* 🌊 RSI Signal Counts - THIS IS THE NEWLY ADDED SECTION */}
            <div>
              <p className="text-purple-300 font-semibold mb-1">🌊 RSI Trend Signals:</p>
              <ul className="text-purple-100 ml-4 list-disc space-y-1">
                <li><span className="font-semibold text-pink-400">Max Zone Pump / Pumping:</span> {maxZonePumpCount}</li>
                <li><span className="font-semibold text-orange-400">Max Zone Dump / Dumping:</span> {maxZoneDumpCount}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Pro Tips / Overall Sentiment */}
        <p className="text-white text-sm font-bold mb-2">
          🌐 Overall Sentiment:{" "}
          <span
            className={
              getSentimentClue().includes("🟢")
                ? "text-green-400"
                : getSentimentClue().includes("🔴")
                ? "text-red-400"
                : getSentimentClue().includes("🟡")
                ? "text-yellow-300"
                : "text-gray-400"
            }
          >
            {getSentimentClue()}
          </span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* 🟢 Bullish Divergence Card */}
          <div className="bg-green-900/40 border border-green-600 p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-bold text-green-300 mb-2">🟢 Bullish Divergence</h2>
            <p className="text-sm text-green-100 mb-2">
              Shorts are paying while price is going up. This creates **squeeze potential**, especially near resistance.
            </p>

            <div className="flex items-center justify-between text-sm text-green-200 mb-2">
              🔼 Price Up + Funding ➖
              <span className="bg-green-700 px-2 py-1 rounded-full font-bold">{priceUpFundingNegativeCount}</span>
            </div>

            {priceUpFundingNegativeCount > 10 && (
              <div className="mt-3 bg-green-800/30 border border-green-600 p-3 rounded-md text-green-200 text-sm font-semibold">
                ✅ Opportunity: Look for **bullish breakouts** or **dip entries** in coins where shorts are paying.
              </div>
            )}
          </div>

          {/* 🔴 Bearish Trap Card */}
          <div className="bg-red-900/40 border border-red-600 p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-bold text-red-300 mb-2">🔴 Bearish Trap</h2>
            <p className="text-sm text-red-100 mb-2">
              Longs are paying while price is dropping. This means bulls are **trapped**, and deeper selloffs may follow.
            </p>

            <div className="flex items-center justify-between text-sm text-red-200 mb-2">
              🔽 Price Down + Funding ➕
              <span className="bg-red-700 px-2 py-1 rounded-full font-bold">{priceDownFundingPositiveCount}</span>
            </div>

            {priceDownFundingPositiveCount > 10 && (
              <div className="mt-3 bg-red-800/30 border border-red-600 p-3 rounded-md text-red-200 text-sm font-semibold">
                ⚠️ Caution: Avoid **longs** on coins still dropping with positive funding — potential liquidation zone.
              </div>
            )}
          </div>
        </div>

        {/* New Funding Imbalance Overview Section */}
        <div className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">💰 Funding Imbalance Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-3 rounded shadow-inner">
              <h3 className="text-green-400 font-bold mb-1">🟢 Price Up</h3>
              <p className="text-sm">➕ Longs Paying: {fundingImbalanceData.priceUpLongsPaying}</p>
              <p className="text-sm">➖ Shorts Paying: {fundingImbalanceData.priceUpShortsPaying}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded shadow-inner">
              <h3 className="text-red-400 font-bold mb-1">🔴 Price Down</h3>
              <p className="text-sm">➕ Longs Paying: {fundingImbalanceData.priceDownLongsPaying}</p>
              <p className="text-sm">➖ Shorts Paying: {fundingImbalanceData.priceDownShortsPaying}</p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-yellow-400 font-bold mb-2">🔥 Top Short Squeeze Candidates</h3>
            <ul className="list-disc list-inside text-sm text-yellow-100">
              {fundingImbalanceData.topShortSqueeze.length > 0 ? (
                fundingImbalanceData.topShortSqueeze.map((d) => (
                  <li key={d.symbol}>{d.symbol} — Funding: {(d.fundingRate * 100).toFixed(4)}% | Change: {d.priceChangePercent.toFixed(2)}%</li>
                ))
              ) : (
                <li>No strong short squeeze candidates at the moment.</li>
              )}
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-pink-400 font-bold mb-2">⚠️ Top Long Trap Candidates</h3>
            <ul className="list-disc list-inside text-sm text-pink-100">
              {fundingImbalanceData.topLongTrap.length > 0 ? (
                fundingImbalanceData.topLongTrap.map((d) => (
                  <li key={d.symbol}>{d.symbol} — Funding: {(d.fundingRate * 100).toFixed(4)}% | Change: {d.priceChangePercent.toFixed(2)}%</li>
                ))
              ) : (
                <li>No strong long trap candidates at the moment.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="🔍 Search symbol (e.g. BTCUSDT)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
              className="bg-gray-800 border border-gray-700 px-4 py-2 pr-10 rounded-md text-sm w-full"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                ❌
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-3 py-2 rounded-md text-sm ${
                showFavoritesOnly ? "bg-yellow-500 text-black" : "bg-gray-700 text-white"
              }`}
            >
              {showFavoritesOnly ? "⭐ Favorites" : "☆ All"}
            </button>
            <button
              onClick={() => {
                setSearchTerm("");
                setShowFavoritesOnly(false);
              }}
              className="bg-red-600 px-3 py-2 rounded-md text-sm text-white"
            >
              ❌ Clear
            </button>
          </div>
        </div>

        {/* Render the new FundingSentimentChart component */}
        <FundingSentimentChart
          greenPositiveFunding={greenPositiveFunding}
          greenNegativeFunding={greenNegativeFunding}
          redPositiveFunding={redPositiveFunding}
          redNegativeFunding={redNegativeFunding}
        />

        {/* Table */}
        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs sticky top-0">
              <tr>
                <th className="p-2">Symbol</th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    setSortBySignal(null);
                    if (sortBy === "priceChangePercent") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("priceChangePercent");
                      setSortOrder("desc");
                    }
                  }}
                >
                  24h Change {sortBy === "priceChangePercent" && (sortOrder === "asc" ? "🔼" : "🔽")}
                </th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    setSortBySignal(null);
                    if (sortBy === "fundingRate") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("fundingRate");
                      setSortOrder("desc");
                    }
                  }}
                >
                  Funding {sortBy === "fundingRate" && (sortOrder === "asc" ? "🔼" : "🔽")}
                </th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    setSortBy("fundingRate"); // Reset other sort
                    setSortOrder("desc"); // Reset other sort
                    setSortBySignal((prev) =>
                      prev === "asc" ? "desc" : prev === "desc" ? null : "asc"
                    );
                  }}
                >
                  Signal {sortBySignal === "asc" ? "🔼" : sortBySignal === "desc" ? "🔽" : ""}
                </th>
                <th className="p-2">S/R Status</th>
                <th
                  className="p-2 cursor-pointer"
                  onClick={() => {
                    setSortBySignal(null); // Reset signal sort
                    if (sortBy === "rsiSignal") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("rsiSignal");
                      setSortOrder("desc"); // Default to desc (most important signals first)
                    }
                  }}
                >
                  RSI Signal {sortBy === "rsiSignal" && (sortOrder === "asc" ? "🔼" : "🔽")}
                </th>
                <th className="p-2">Entry</th>
                <th className="p-2">Stop Loss</th>
                <th className="p-2">Take Profit</th>
                <th className="p-2">★</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter(
                  (item) => {
                    const hasSignal = tradeSignals.some((s) => s.symbol === item.symbol && s.signal !== null);
                    return (
                      hasSignal &&
                      (!searchTerm || item.symbol.includes(searchTerm)) &&
                      (!showFavoritesOnly || favorites.includes(item.symbol))
                    );
                  }
                )
                .map((item) => {
                  const signal = tradeSignals.find((s) => s.symbol === item.symbol);
                  return (
                    <tr key={item.symbol} className="border-t border-gray-700 hover:bg-gray-800">
                      <td className="p-2 flex items-center gap-2">
                        {item.symbol}
                      </td>
                      <td className={item.priceChangePercent >= 0 ? "text-green-400" : "text-red-400"}>
                        {item.priceChangePercent.toFixed(2)}%
                      </td>
                      <td className={item.fundingRate >= 0 ? "text-green-400" : "text-red-400"}>
                        {(item.fundingRate * 100).toFixed(4)}%
                      </td>

                      <td className={`p-2 font-semibold ${
                        signal?.signal === "long"
                          ? "text-green-400"
                          : signal?.signal === "short"
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}>
                        {signal?.signal ? signal.signal.toUpperCase() : "-"}
                        {signal?.signal && signal.isValidatedBySR !== undefined && (
                          <span
                            className={`ml-1 text-xs px-1 py-0.5 rounded ${
                              signal.isValidatedBySR ? "bg-green-700 text-green-100" : "bg-red-700 text-red-100"
                            }`}
                            title={signal.srReason || "S/R Validation"}
                          >
                            {signal.isValidatedBySR ? "✓" : "✗"}
                          </span>
                        )}
                      </td>

                      <td className="p-2 text-gray-400 text-xs">
                        {item.srStatus?.replace(/_/g, ' ') || "N/A"}
                        {item.majorSupport && item.majorResistance && (
                            <span className="ml-1 text-blue-400">
                                (S: {item.majorSupport.toFixed(4)}, R: {item.majorResistance.toFixed(4)})
                            </span>
                        )}
                      </td>

                      {/* RSI Signal Cell */}
                      <td className={`p-2 text-xs font-semibold ${
                        item.rsiSignal?.includes("PUMP") ? "text-pink-400" :
                        item.rsiSignal?.includes("DUMP") ? "text-orange-400" :
                        item.rsiSignal === "OVERBOUGHT" ? "text-red-300" :
                        item.rsiSignal === "OVERSOLD" ? "text-green-300" :
                        "text-gray-400"
                      }`}>
                        {item.rsiSignal}
                      </td>

                      <td className="p-2">
                        {signal && signal.entry !== null ? signal.entry.toFixed(4) : "-"}
                      </td>

                      <td className="p-2">
                        {signal && signal.stopLoss !== null ? signal.stopLoss.toFixed(4) : "-"}
                      </td>

                      <td className="p-2">
                        {signal && signal.takeProfit !== null ? signal.takeProfit.toFixed(4) : "-"}
                      </td>

                      <td className="p-2 text-yellow-400 cursor-pointer select-none" onClick={() =>
                        setFavorites((prev) =>
                          prev.includes(item.symbol)
                            ? prev.filter((sym) => sym !== item.symbol)
                            : [...prev, item.symbol]
                        )
                      }>
                        {favorites.includes(item.symbol) ? "★" : "☆"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <p className="text-gray-500 text-xs mt-6">Auto-refreshes every 10 seconds | Powered by Binance API</p>
      </div>
    </div>
  );
}
