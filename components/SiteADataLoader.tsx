import { useEffect, useState, useMemo } from "react";
import FlagSignalsDashboard from './FlagSignalsDashboard';

// --- Type Definitions ---
interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MainTrend {
  trend: 'bullish' | 'bearish' | 'neutral';
  type: 'support' | 'resistance' | 'none';
  crossoverPrice: number;
  // Still relevant for EMA context
  breakout: 'bullish' | 'bearish' | null;
  // Now for new high/low breakout
  isNear: boolean;
  isDojiAfterBreakout: boolean;
  // Applies to the new breakout
}

interface SignalData {
  symbol: string;
  closes: number[];
  rsi14: number[];
  priceChangePercent: number;
  mainTrend: MainTrend;
  prevClosedGreen: boolean | null;
  prevClosedRed: boolean | null;
  highestVolumeColorPrev: 'green' | 'red' | null;
  isBullFlag: boolean;
  isBearFlag: boolean;
}

// --- Utility Functions ---
/**
 * Calculates the Exponential Moving Average (EMA) for a given dataset.
 * @param data - The array of numbers (e.g., closing prices) to calculate EMA for.
 * @param period - The period (number of data points) for the EMA calculation.
 * @returns An array containing the EMA values, with NaN for initial periods.
 */
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  // Smoothing constant
  const ema: number[] = [];
  let previousEma: number | null = null;
  for (let i = 0; i < data.length; i++) {
    // For the initial periods before enough data for SMA, push NaN
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }
    // Calculate initial Simple Moving Average (SMA) for the first EMA point
    if (i === period - 1) {
      const sma = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
      previousEma = sma;
    }
    // Calculate EMA using the formula: CurrentPrice * K + PreviousEMA * (1 - K)
    if (previousEma !== null) {
      const currentEma: number = data[i] * k + previousEma * (1 - k);
      ema.push(currentEma);
      previousEma = currentEma;
    }
  }
  return ema;
}

/**
 * Calculates the Relative Strength Index (RSI) for a given set of closing prices.
 * @param closes - An array of closing prices.
 * @param period - The period (number of data points) for the RSI calculation.
 * @returns An array containing the RSI values, with NaN for initial periods.
 */
function calculateRSI(closes: number[], period = 3): number[] {
  if (!Array.isArray(closes) || closes.length <= period) {
    return [];
  }

  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ?
      Number.POSITIVE_INFINITY : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  for (let i = 0; i < period; i++) {
    rsi[i] = NaN;
  }

  return rsi;
}

/**
 * Calculates the recent RSI difference (pump/dump strength) over a lookback period.
 * @param rsi - The array of RSI values.
 * @param lookback - The number of recent RSI values to consider.
 * @returns An object containing recent high/low RSI, pump/dump strength, direction, and overall strength, or null if data is insufficient.
 */
function getRecentRSIDiff(
  rsi: number[],
  lookback = 14
): {
  recentHigh: number;
  recentLow: number;
  pumpStrength: number;
  dumpStrength: number;
  direction: 'pump' | 'dump' | 'neutral';
  strength: number;
} | null {
  if (rsi.length < lookback) return null;
  const recentRSI = rsi.slice(-lookback);
  let recentHigh = -Infinity;
  let recentLow = Infinity;
  for (const value of recentRSI) {
    if (!isNaN(value)) {
      if (value > recentHigh) recentHigh = value;
      if (value < recentLow) recentLow = value;
    }
  }

  const pumpStrength = recentHigh - recentLow;
  const dumpStrength = Math.abs(recentLow - recentHigh);

  const startRSI = recentRSI[0];
  const endRSI = recentRSI[recentRSI.length - 1];
  const direction = endRSI > startRSI ? 'pump' : endRSI < startRSI ? 'dump' : 'neutral';
  const strength = Math.abs(endRSI - startRSI);

  return {
    recentHigh,
    recentLow,
    pumpStrength,
    dumpStrength,
    direction,
    strength,
  };
}

/**
 * Determines a trading signal based on RSI pump/dump zones.
 * @param s - An object containing signal data, specifically `rsi14`.
 * @returns A string representing the detected signal (e.g., 'MAX ZONE PUMP', 'NO STRONG SIGNAL').
 */
const getSignal = (s: { rsi14?: number[] }): string => {
  const pumpDump = s.rsi14 ?
    getRecentRSIDiff(s.rsi14, 14) : null;
  if (!pumpDump) return 'NO DATA';

  const { direction, pumpStrength: pump, dumpStrength: dump } = pumpDump;
  const inRange = (val: number, min: number, max: number) =>
    val !== undefined && val >= min && val <= max;
  const isAbove30 = (val: number) => val !== undefined && val >= 30;

  const pumpAbove30 = isAbove30(pump);
  const dumpAbove30 = isAbove30(dump);

  const pumpInRange_21_26 = inRange(pump, 21, 26);
  const dumpInRange_21_26 = inRange(dump, 21, 26);
  const pumpInRange_1_10 = inRange(pump, 1, 10);
  const dumpInRange_1_10 = inRange(dump, 1, 10);
  if (direction === 'pump' && pumpAbove30) return 'MAX ZONE PUMP';
  if (direction === 'dump' && dumpAbove30) return 'MAX ZONE DUMP';
  if (pumpInRange_21_26 && direction === 'pump') return 'BALANCE ZONE PUMP';
  if (dumpInRange_21_26 && direction === 'dump') return 'BALANCE ZONE DUMP';
  if (pumpInRange_1_10 && direction === 'pump') return 'LOWEST ZONE PUMP';
  if (dumpInRange_1_10 && direction === 'dump') return 'LOWEST ZONE DUMP';
  return 'NO STRONG SIGNAL';
};

// --- SiteADataLoader Component ---
export default function SiteADataLoader() {
  const [signals, setSignals] = useState<SignalData[]>([]);
  // Explicitly type signals
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1d');
  // Default to 1d
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // Utility to generate UTC timestamp at specific hour
  const getUTCMillis = (year: number, month: number, date: number, hour: number, minute: number): number => {
    return Date.UTC(year, month, date, hour, minute);
  };

  /**
   * Calculates session start and end times based on the selected timeframe.
   * For '1d', it uses a custom 8 AM PH time (UTC+8) session.
   * For '15m' and '4h', it calculates generic fixed-interval sessions.
   * @param tf - The selected timeframe ('15m', '4h', '1d').
   * @returns An object containing session start/end and previous session start/end timestamps in milliseconds.
   */
  const getSessions = (tf: string) => {
    const now = new Date();
    const timeframeToUse = tf || timeframe;

    if (!timeframeToUse || timeframeToUse === '1d') {
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const date = now.getUTCDate();

      const getUTCMillisFor1d = (y: number, m: number, d: number, hPH: number, min: number) =>
        Date.UTC(y, m, d, hPH - 8, min);
      // UTC+8 to UTC conversion for PH time

      const today8AM_UTC = getUTCMillisFor1d(year, month, date, 8, 0);
      const tomorrow745AM_UTC = getUTCMillisFor1d(year, month, date + 1, 7, 45);

      let sessionStart: number, sessionEnd: number;
      if (now.getTime() >= today8AM_UTC) {
        sessionStart = today8AM_UTC;
        sessionEnd = tomorrow745AM_UTC;
      } else {
        const yesterday8AM_UTC = getUTCMillisFor1d(year, month, date - 1, 8, 0);
        const today745AM_UTC = getUTCMillisFor1d(year, month, date, 7, 45);
        sessionStart = yesterday8AM_UTC;
        sessionEnd = today745AM_UTC;
      }

      const prevSessionStart = getUTCMillisFor1d(year, month, date - 1, 8, 0);
      const prevSessionEnd = getUTCMillisFor1d(year, month, date, 7, 45);

      return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
    } else {
      const nowMillis = now.getTime();
      const MILLISECONDS: { [key: string]: number } = {
        '15m': 15 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
      };
      const tfMillis = MILLISECONDS[timeframeToUse];
      const sessionStart = Math.floor(nowMillis / tfMillis) * tfMillis;
      const sessionEnd = sessionStart + tfMillis;
      const prevSessionStart = sessionStart - tfMillis;
      const prevSessionEnd = sessionStart;

      return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
    }
  };
  /**
   * Fetches data from a given URL with exponential backoff and specific error handling for Binance API.
   * @param url - The URL to fetch data from.
   * @param retries - The maximum number of retries.
   * @param delay - The initial delay in milliseconds before retrying.
   * @returns The JSON response data, or null if an invalid symbol error occurs or all retries fail.
   */
  const fetchWithRetry = async (url: string, retries = 5, delay = 1000): Promise<any |
    null> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (response.status === 429 || response.status === 418) { // 429 Too Many Requests, 418 I'm a teapot (Binance sometimes uses this)
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * Math.pow(2, i);
          console.warn(`Rate limit hit. Retrying in ${waitTime / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
          // Retry the request
        }
        if (!response.ok) {
          const errorBody = await response.json();
          // Check for Binance specific error codes for IP ban or invalid symbol
          if (errorBody.code === -1003) { // IP ban
            console.warn(`Binance IP ban detected. Retrying in ${delay * Math.pow(2, i) / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            continue;
            // Retry the request
          } else if (errorBody.code === -1121 || errorBody.msg === "Invalid symbol." || errorBody.msg === "Invalid symbol status.") {
            // Specific handling for invalid symbol errors: return null to skip this symbol
            console.warn(`Invalid symbol encountered for URL: ${url}. Skipping this symbol.`);
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody.msg || response.statusText}`);
        }
        return await response.json();
      } catch (error) {
        console.error(`Attempt ${i + 1} failed for ${url}:`, error);
        if (i < retries - 1) {
          const waitTime = delay * Math.pow(2, i);
          console.log(`Retrying in ${waitTime / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // If all retries fail, for a symbol-specific error, return null.
          // For other critical errors, re-throw.
          if (error instanceof Error && error.message.includes("Invalid symbol")) { // Check for the specific message from previous handling
            return null;
          }
          throw error;
          // Re-throw if all retries fail for other reasons
        }
      }
    }
    return null;
    // Should not be reached if retries > 0 and no error, but as a fallback
  };
  useEffect(() => {
    let isMounted = true;
    const BATCH_SIZE = 10;
    const INTERVAL_MS = 1000; // Base interval between batches
    let currentIndex = 0;
    let symbols: string[] = [];

    /**
     * Fetches and analyzes data for a single cryptocurrency symbol.
     * @param symbol - The cryptocurrency symbol (e.g., "BTCUSDT").
     * @param interval - The candlestick interval (e.g., "15m", "4h", "1d").
     * @returns An object containing analyzed
     * signal data for the symbol, or null if an error occurs.
     */
    const fetchAndAnalyze = async (symbol: string, interval: string): Promise<SignalData | null> => {
      // Fetch klines data
      const raw = await fetchWithRetry(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`
      );

      // If raw is null (due to invalid symbol or other fetch error), skip this symbol
      if (raw === null) {
        return null;
      }

      const candles: Candle[] = raw.map((c: any[]) => ({
        timestamp: c[0],
        open: +c[1],
        high: +c[2],
        low: +c[3],
        close: +c[4],
        volume: +c[5],
      }));
      const closes: number[] = candles.map((c: Candle) => c.close);
      const opens: number[] = candles.map((c: Candle) => c.open);
      const highs: number[] = candles.map((c: Candle) => c.high);
      const lows: number[] = candles.map((c: Candle) => c.low);
      const ema5 = calculateEMA(closes, 5);
      const ema10 = calculateEMA(closes, 10);
      const ema14 = calculateEMA(closes, 14);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      const ema70 = calculateEMA(closes, 70);
      const ema200 = calculateEMA(closes, 200);
      const rsi14 = calculateRSI(closes, 14);
      // Fetch 24h ticker data
      const ticker24h = await fetchWithRetry(
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
      );
      // If ticker24h is null (due to invalid symbol or other fetch error), skip this symbol
      if (ticker24h === null) {
        return null;
      }

      const priceChangePercent = parseFloat(ticker24h.priceChangePercent);
      // Calculate previous session candles and highest volume color
      const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions(interval);
      // Get current session times too

      const candlesCurrentSession = candles.filter((c: Candle) => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
      const candlesPrevSession = candles.filter((c: Candle) => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

      let highestVolumeColorPrev: 'green' | 'red' |
        null = null;
      if (candlesPrevSession.length > 0) {
        let maxVolume = -1;
        let highestVolumeCandle: Candle | null = null;
        for (const candle of candlesPrevSession) {
          if (candle.volume > maxVolume) {
            maxVolume = candle.volume;
            highestVolumeCandle = candle;
          }
        }
        if (highestVolumeCandle) {
          // Determine color based on close vs open of the highest volume candle
          highestVolumeColorPrev = highestVolumeCandle.close > highestVolumeCandle.open ?
            'green' : 'red';
        }
      }

      // Simulate prevClosedGreen/Red (simplified)
      let prevClosedGreen: boolean |
        null = null;
      let prevClosedRed: boolean | null = null;
      if (candles.length >= 2) {
        const prevCandle = candles[candles.length - 2];
        prevClosedGreen = prevCandle.close > prevCandle.open;
        prevClosedRed = prevCandle.close < prevCandle.open;
      }
      
      // Calculate the bullish and bearish flag signals
      const isBullFlag = (ema5.at(-1) > ema10.at(-1) && ema10.at(-1) > ema20.at(-1) && ema20.at(-1) > ema50.at(-1) && rsi14.at(-1) > 50);
      const isBearFlag = (ema5.at(-1) < ema10.at(-1) && ema10.at(-1) < ema20.at(-1) && ema20.at(-1) < ema50.at(-1) && rsi14.at(-1) < 50);

      // Initialize mainTrend object
      let mainTrend: MainTrend = {
        trend: 'neutral',
        type: 'none',
        crossoverPrice: 0,
        breakout: null,
        isNear: false,
        isDojiAfterBreakout: false,
      };
      // Determine overall trend based on CURRENT EMA values (from full 500 candles)
      const lastEma70Full = ema70.at(-1);
      const lastEma200Full = ema200.at(-1);

      if (lastEma70Full !== undefined && lastEma200Full !== undefined) {
        if (lastEma70Full > lastEma200Full) {
          mainTrend.trend = 'bullish';
          mainTrend.type = 'support';
        } else if (lastEma70Full < lastEma200Full) {
          mainTrend.trend = 'bearish';
          mainTrend.type = 'resistance';
        }
      }

      // Calculate today's highest high and lowest low from current session candles
      // Ensure there are candles in the current session before reducing
      const todaysHighestHigh = candlesCurrentSession.length > 0 ?
        candlesCurrentSession.reduce((max, c) => Math.max(max, c.high), -Infinity) : null;
      const todaysLowestLow = candlesCurrentSession.length > 0 ?
        candlesCurrentSession.reduce((min, c) => Math.min(min, c.low), Infinity) : null;
      // Calculate previous session's highest high and lowest low
      // Ensure there are candles in the previous session before reducing
      const prevSessionHigh = candlesPrevSession.length > 0 ?
        candlesPrevSession.reduce((max, c) => Math.max(max, c.high), -Infinity) : null;
      const prevSessionLow = candlesPrevSession.length > 0 ?
        candlesPrevSession.reduce((min, c) => Math.min(min, c.low), Infinity) : null;
      // New Breakout Logic: Today's high/low vs. Previous Session's high/low
      const bullishBreakout = todaysHighestHigh !== null && prevSessionHigh !== null && todaysHighestHigh > prevSessionHigh;
      const bearishBreakout = todaysLowestLow !== null && prevSessionLow !== null && todaysLowestLow < prevSessionLow;
      // Set mainTrend.breakout based on the new logic
      if (bullishBreakout) {
        mainTrend.breakout = 'bullish';
      } else if (bearishBreakout) {
        mainTrend.breakout = 'bearish';
      }

      // Check for doji after breakout (applies to the new breakout)
      if (mainTrend.breakout && candlesCurrentSession.length > 0) {
        const lastCandleCurrentSession = candlesCurrentSession[candlesCurrentSession.length - 1];
        const isDoji = Math.abs(lastCandleCurrentSession.open - lastCandleCurrentSession.close) < (lastCandleCurrentSession.high - lastCandleCurrentSession.low) * 0.1;
        // 10% threshold for doji
        mainTrend.isDojiAfterBreakout = isDoji;
      }
      
      const currentPrice = closes.at(-1);
      const lastRSI = rsi14.at(-1);
      
      return {
        symbol,
        closes,
        rsi14,
        priceChangePercent,
        mainTrend,
        prevClosedGreen,
        prevClosedRed,
        highestVolumeColorPrev,
        isBullFlag: isBullFlag && !isNaN(isBullFlag),
        isBearFlag: isBearFlag && !isNaN(isBearFlag),
      };
    };

    // --- Main Fetching Logic ---
    const fetchAllSymbols = async () => {
      setLoading(true);
      try {
        const symbolsResponse = await fetchWithRetry('https://fapi.binance.com/fapi/v1/exchangeInfo');
        if (symbolsResponse === null) {
          throw new Error("Could not fetch symbols.");
        }
        symbols = symbolsResponse.symbols
          .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
          .map((s: any) => s.symbol)
          .slice(0, 50); // Get top 50 symbols

        let allSignals: SignalData[] = [];
        const processBatch = async () => {
          if (currentIndex >= symbols.length || !isMounted) {
            setLoading(false);
            return;
          }
          const batch = symbols.slice(currentIndex, currentIndex + BATCH_SIZE);
          const batchPromises = batch.map(symbol => fetchAndAnalyze(symbol, timeframe));
          const batchResults = await Promise.all(batchPromises);
          
          // Filter out null results (invalid symbols)
          const validResults = batchResults.filter(result => result !== null) as SignalData[];
          allSignals = [...allSignals, ...validResults];
          setSignals(allSignals);
          currentIndex += BATCH_SIZE;

          if (currentIndex < symbols.length && isMounted) {
            // Set a delay between batches to respect API limits
            setTimeout(processBatch, INTERVAL_MS);
          } else {
            setLoading(false);
          }
        };

        await processBatch(); // Start the first batch
        setLastUpdated(new Date().toLocaleTimeString());
        
      } catch (error) {
        console.error("Failed to fetch symbols or data:", error);
        setLoading(false);
      }
    };

    fetchAllSymbols();
    const intervalId = setInterval(fetchAllSymbols, 60000); // Poll every 60 seconds

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [timeframe]); // Dependencies for useEffect

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
  };
  
  const formattedSignals = useMemo(() => {
    return signals.map(s => {
      const currentPrice = s.closes.at(-1)?.toFixed(2) || 'N/A';
      const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
      const trendColor = s.mainTrend.trend === 'bullish' ? 'text-green-400' : s.mainTrend.trend === 'bearish' ? 'text-red-400' : 'text-gray-400';
      const trendText = s.mainTrend.trend.toUpperCase();
      const breakoutText = s.mainTrend.breakout ?
        s.mainTrend.breakout.toUpperCase() : 'N/A';
      const dojiText = s.mainTrend.isDojiAfterBreakout ?
        'Doji After Breakout' : 'No Doji';

      return {
        ...s,
        currentPrice,
        pumpDump,
        trendColor,
        trendText,
        breakoutText,
        dojiText
      };
    });
  }, [signals]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center text-purple-400">Trading Signals Dashboard</h1>

        <div className="flex justify-between items-center mb-6">
          <div className="flex space-x-2">
            {['15m', '4h', '1d'].map(tf => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                className={`py-2 px-4 rounded-lg font-semibold transition-colors duration-200 ${
                  timeframe === tf
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <div className="text-sm text-gray-400">
              Last Updated: {lastUpdated}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-[50vh]">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : (
          <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
            <div className="align-middle inline-block min-w-full">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Price
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      24h Change
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Pump/Dump Str
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      High Vol Color
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Bull Flag
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Bear Flag
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {formattedSignals.map((s, index) => {
                    const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
                    const currentPrice = s.closes.at(-1)?.toFixed(2) || 'N/A';
                    return (
                      <tr key={index} className="hover:bg-gray-700 transition-colors duration-150">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-purple-200">
                          {s.symbol}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                          ${currentPrice}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <span className={`font-semibold ${s.priceChangePercent > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {s.priceChangePercent?.toFixed(2) || 'N/A'}%
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                          {pumpDump?.pumpStrength?.toFixed(2) || 'N/A'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <span className={`font-semibold ${s.highestVolumeColorPrev === 'green' ? 'text-green-400' : s.highestVolumeColorPrev === 'red' ? 'text-red-400' : 'text-gray-400'}`}>
                            {s.highestVolumeColorPrev ? s.highestVolumeColorPrev.toUpperCase() : 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {s.isBullFlag ? <span className="text-green-400 font-bold">✓</span> : <span className="text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {s.isBearFlag ? <span className="text-red-400 font-bold">✓</span> : <span className="text-gray-500">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      < FlagSignalsDashboard />
    </div>
  );
}
