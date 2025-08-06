import { useEffect, useState, useMemo } from "react";

// --- Utility Functions ---
/**
 * Calculates the Exponential Moving Average (EMA) for a given dataset.
 * @param data - The array of numbers (e.g., closing prices) to calculate EMA for.
 * @param period - The period (number of data points) for the EMA calculation.
 * @returns An array containing the EMA values, with NaN for initial periods.
 */
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1); // Smoothing constant
  const ema: number[] = [];
  let previousEma: number | null = null; // Explicitly type as number or null

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
      const currentEma: number = data[i] * k + previousEma * (1 - k); // Explicitly type as number
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

    rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
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
  const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
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
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1d'); // Default to 1d
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
        Date.UTC(y, m, d, hPH - 8, min); // UTC+8 to UTC conversion for PH time

      const today8AM_UTC = getUTCMillisFor1d(year, month, date, 8, 0);
      const tomorrow745AM_UTC = getUTCMillisFor1d(year, month, date + 1, 7, 45);

      let sessionStart, sessionEnd;
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
  const fetchWithRetry = async (url: string, retries = 5, delay = 1000): Promise<any | null> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (response.status === 429 || response.status === 418) { // 429 Too Many Requests, 418 I'm a teapot (Binance sometimes uses this)
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * Math.pow(2, i);
          console.warn(`Rate limit hit. Retrying in ${waitTime / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry the request
        }
        if (!response.ok) {
          const errorBody = await response.json();
          // Check for Binance specific error codes for IP ban or invalid symbol
          if (errorBody.code === -1003) { // IP ban
            console.warn(`Binance IP ban detected. Retrying in ${delay * Math.pow(2, i) / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            continue; // Retry the request
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
          throw error; // Re-throw if all retries fail for other reasons
        }
      }
    }
    return null; // Should not be reached if retries > 0 and no error, but as a fallback
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
     * @returns An object containing analyzed signal data for the symbol, or null if an error occurs.
     */
    const fetchAndAnalyze = async (symbol: string, interval: string) => {
      // Fetch klines data
      const raw = await fetchWithRetry(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`
      );

      // If raw is null (due to invalid symbol or other fetch error), skip this symbol
      if (raw === null) {
        return null;
      }

      const candles = raw.map((c: any[]) => ({
        timestamp: c[0],
        open: +c[1],
        high: +c[2],
        low: +c[3],
        close: +c[4],
        volume: +c[5],
      }));

      const closes = candles.map((c: { close: number }) => c.close);
      // const opens = candles.map((c) => c.open); // Not used by getSignal directly
      // const highs = candles.map((c) => c.high); // Not used by getSignal directly
      // const lows = candles.map((c) => c.low); // Not used by getSignal directly

      const ema14 = calculateEMA(closes, 14);
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

      // Simulate mainTrend (simplified for this example as it's not directly used for MAX ZONE PUMP)
      const lastEMA70 = ema70.at(-1) || 0;
      const lastEMA200 = ema200.at(-1) || 0;
      const mainTrend = {
        trend: lastEMA70 >= lastEMA200 ? 'bullish' : 'bearish',
        type: lastEMA70 >= lastEMA200 ? 'support' : 'resistance',
        crossoverPrice: closes.at(-1) || 0,
        breakout: null,
        isNear: false,
        isDojiAfterBreakout: false,
      };

      // Calculate previous session candles and highest volume color
      const { prevSessionStart, prevSessionEnd } = getSessions(interval); // Pass interval to getSessions
      const candlesPrev = candles.filter(c => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

      let highestVolumeColorPrev: 'green' | 'red' | null = null;
      if (candlesPrev.length > 0) {
        let maxVolume = -1;
        let highestVolumeCandle: { open: number; close: number; volume: number } | null = null;
        for (const candle of candlesPrev) {
          if (candle.volume > maxVolume) {
            maxVolume = candle.volume;
            highestVolumeCandle = candle;
          }
        }
        if (highestVolumeCandle) {
          // Determine color based on close vs open of the highest volume candle
          highestVolumeColorPrev = highestVolumeCandle.close > highestVolumeCandle.open ? 'green' : 'red';
        }
      }

      // Simulate prevClosedGreen/Red (simplified)
      let prevClosedGreen: boolean | null = null;
      let prevClosedRed: boolean | null = null;
      if (candles.length >= 2) {
        const prevCandle = candles[candles.length - 2];
        prevClosedGreen = prevCandle.close > prevCandle.open;
        prevClosedRed = prevCandle.close < prevCandle.open;
      }

      return {
        symbol,
        closes,
        rsi14, // Keep rsi14 for getSignal calculation
        priceChangePercent,
        mainTrend,
        prevClosedGreen,
        prevClosedRed,
        highestVolumeColorPrev, // Add the calculated highest volume color
      };
    };

    /**
     * Processes symbols in batches to avoid rate limits and updates the signals state.
     */
    const processBatch = async () => {
      if (!isMounted) return;

      if (symbols.length === 0) {
        // Fetch all symbols once
        try {
          const exchangeInfo = await fetchWithRetry('https://fapi.binance.com/fapi/v1/exchangeInfo');
          if (exchangeInfo === null) {
            console.error('Failed to fetch exchange info, cannot proceed.');
            setLoading(false);
            return;
          }
          if (exchangeInfo && Array.isArray(exchangeInfo.symbols)) {
            symbols = exchangeInfo.symbols.map((s: { symbol: string }) => s.symbol).filter((s: string) => s.endsWith('USDT'));
          } else {
            console.error('Exchange info did not contain a valid symbols array:', exchangeInfo);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.error('Error fetching exchange info:', error);
          setLoading(false);
          return;
        }
      }

      const newSignals = await Promise.all(
        symbols.slice(currentIndex, currentIndex + BATCH_SIZE).map((symbol) => fetchAndAnalyze(symbol, timeframe))
      );

      if (isMounted) {
        setSignals((prev) => [...prev, ...newSignals.filter(Boolean)]); // filter(Boolean) removes null entries
        currentIndex += BATCH_SIZE;

        // Update last updated timestamp after processing a batch
        setLastUpdated(new Date().toLocaleTimeString());

        if (currentIndex < symbols.length) {
          setTimeout(processBatch, INTERVAL_MS);
        } else {
          setLoading(false); // All symbols processed
        }
      }
    };

    // Initialize/reset signals and loading state when timeframe changes or on initial load
    setSignals([]); // Clear previous signals when timeframe changes
    setLoading(true);
    currentIndex = 0; // Reset index for new fetch
    symbols = []; // Reset symbols to re-fetch exchange info
    setLastUpdated(null); // Reset last updated timestamp

    processBatch();

    // Cleanup function for useEffect to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, [timeframe]); // Rerun effect when timeframe changes

  // Memoize the filtering of signals for "MAX ZONE PUMP" to optimize performance
  const maxPumpZoneSignals = useMemo(() => {
    return signals.filter(s => getSignal(s) === 'MAX ZONE PUMP');
  }, [signals]);

  // Calculate statistics for the "Market Overview" section
  const marketStats = useMemo(() => {
    const greenPriceChangeCount = signals.filter(
      (t) => parseFloat(t.priceChangePercent) > 0
    ).length;

    const redPriceChangeCount = signals.filter(
      (t) => parseFloat(t.priceChangePercent) < 0
    ).length;

    const greenVolumeCount = signals.filter(
      (s) => s.highestVolumeColorPrev === 'green'
    ).length;

    const redVolumeCount = signals.filter(
      (s) => s.highestVolumeColorPrev === 'red'
    ).length;

    return {
      greenPriceChangeCount,
      redPriceChangeCount,
      greenVolumeCount,
      redVolumeCount,
    };
  }, [signals]);


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-purple-400 mb-6 text-center">
          Crypto Signals Dashboard 🚀
        </h1>

        {/* Timeframe Selector */}
        <div className="flex justify-center mb-6 space-x-4">
          {['15m', '4h', '1d'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200
                ${timeframe === tf
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {lastUpdated && (
            <p className="text-center text-sm text-gray-400 mb-4">
                Last updated: <span className="font-medium text-gray-200">{lastUpdated}</span>
            </p>
        )}

        {/* Market Overview Section */}
        <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 mb-8 border border-blue-700">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-300 mb-4 text-center">
                Market Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-400">Green Price Change</p>
                    <p className="text-lg font-semibold text-green-400">{marketStats.greenPriceChangeCount}</p>
                </div>
                <div className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-400">Red Price Change</p>
                    <p className="text-lg font-semibold text-red-400">{marketStats.redPriceChangeCount}</p>
                </div>
                <div className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-400">Green Volume (Prev Session)</p>
                    <p className="text-lg font-semibold text-green-400">{marketStats.greenVolumeCount}</p>
                </div>
                <div className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-400">Red Volume (Prev Session)</p>
                    <p className="text-lg font-semibold text-red-400">{marketStats.redVolumeCount}</p>
                </div>
            </div>
        </div>

        {loading && (
          <div className="text-center text-lg text-gray-400 mt-10">
            Loading signals... This might take a moment. ⏳
          </div>
        )}

        {!loading && maxPumpZoneSignals.length === 0 && (
          <div className="text-center text-lg text-gray-400 mt-10">
            No "MAX ZONE PUMP" signals found for the selected timeframe.
          </div>
        )}

        {/* Display MAX ZONE PUMP Signals */}
        {!loading && maxPumpZoneSignals.length > 0 && (
          <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 mb-8 border border-purple-700">
            <h2 className="text-2xl sm:text-3xl font-bold text-purple-300 mb-5 text-center">
              MAX ZONE PUMP Signals ({maxPumpZoneSignals.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider rounded-tl-lg">
                      Symbol
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Current Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      24h Change (%)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      RSI Pump Strength
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider rounded-tr-lg">
                      Prev Session Volume
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {maxPumpZoneSignals.map((s) => {
                    const pumpDump = getRecentRSIDiff(s.rsi14, 14);
                    const currentPrice = s.closes ? s.closes[s.closes.length - 1]?.toFixed(2) : 'N/A';
                    return (
                      <tr key={s.symbol} className="hover:bg-gray-750 transition-colors duration-150">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
