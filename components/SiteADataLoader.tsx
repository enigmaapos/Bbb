import React, { useEffect, useState, useMemo } from 'react';
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
  breakout: 'bullish' | 'bearish' | null;
  isNear: boolean;
  isDojiAfterBreakout: boolean;
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
  const ema: number[] = [];
  let previousEma: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }
    if (i === period - 1) {
      const sma = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
      previousEma = sma;
    }
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
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('15m');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const getUTCMillis = (year: number, month: number, date: number, hour: number, minute: number): number => {
    return Date.UTC(year, month, date, hour, minute);
  };

  const getSessions = (tf: string) => {
    const now = new Date();
    const timeframeToUse = tf || timeframe;

    if (!timeframeToUse || timeframeToUse === '1d') {
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const date = now.getUTCDate();

      const getUTCMillisFor1d = (y: number, m: number, d: number, hPH: number, min: number) =>
        Date.UTC(y, m, d, hPH - 8, min);
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

  const fetchWithRetry = async (url: string, retries = 5, delay = 1000): Promise<any |
    null> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (response.status === 429 || response.status === 418) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * Math.pow(2, i);
          console.warn(`Rate limit hit. Retrying in ${waitTime / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        if (!response.ok) {
          const errorBody = await response.json();
          if (errorBody.code === -1003) {
            console.warn(`Binance IP ban detected. Retrying in ${delay * Math.pow(2, i) / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            continue;
          } else if (errorBody.code === -1121 || errorBody.msg === "Invalid symbol." || errorBody.msg === "Invalid symbol status.") {
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
          if (error instanceof Error && error.message.includes("Invalid symbol")) {
            return null;
          }
          throw error;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    let isMounted = true;
    const BATCH_SIZE = 10;
    const INTERVAL_MS = 1000;
    let currentIndex = 0;
    let symbols: string[] = [];

    const fetchAndAnalyze = async (symbol: string, interval: string): Promise<SignalData | null> => {
      const raw = await fetchWithRetry(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`
      );

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
      const opens: number[] = candles.map((c:
        Candle) => c.open);
      const highs: number[] = candles.map((c: Candle) => c.high);
      const lows: number[] = candles.map((c: Candle) => c.low);
      const ema14 = calculateEMA(closes, 14);
      const ema70 = calculateEMA(closes, 70);
      const ema200 = calculateEMA(closes, 200);
      const rsi14 = calculateRSI(closes, 14);

      const ticker24h = await fetchWithRetry(
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
      );
      if (ticker24h === null) {
        return null;
      }

      const priceChangePercent = parseFloat(ticker24h.priceChangePercent);
      const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions(interval);

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
          highestVolumeColorPrev = highestVolumeCandle.close > highestVolumeCandle.open ?
            'green' : 'red';
        }
      }

      let prevClosedGreen: boolean |
        null = null;
      let prevClosedRed: boolean | null = null;
      if (candles.length >= 2) {
        const prevCandle = candles[candles.length - 2];
        prevClosedGreen = prevCandle.close > prevCandle.open;
        prevClosedRed = prevCandle.close < prevCandle.open;
      }

      let mainTrend: MainTrend = {
        trend: 'neutral',
        type: 'none',
        crossoverPrice: 0,
        breakout: null,
        isNear: false,
        isDojiAfterBreakout: false,
      };
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

      const todaysHighestHigh = candlesCurrentSession.length > 0 ?
        candlesCurrentSession.reduce((max, c) => Math.max(max, c.high), -Infinity) : null;
      const todaysLowestLow = candlesCurrentSession.length > 0 ?
        candlesCurrentSession.reduce((min, c) => Math.min(min, c.low), Infinity) : null;

      const prevSessionHigh = candlesPrevSession.length > 0 ?
        candlesPrevSession.reduce((max, c) => Math.max(max, c.high), -Infinity) : null;
      const prevSessionLow = candlesPrevSession.length > 0 ?
        candlesPrevSession.reduce((min, c) => Math.min(min, c.low), Infinity) : null;

      const bullishBreakout = todaysHighestHigh !== null && prevSessionHigh !== null && todaysHighestHigh > prevSessionHigh;
      const bearishBreakout = todaysLowestLow !== null && prevSessionLow !== null && todaysLowestLow < prevSessionLow;

      if (bullishBreakout) {
        mainTrend.breakout = 'bullish';
      } else if (bearishBreakout) {
        mainTrend.breakout = 'bearish';
      }

      if (mainTrend.breakout && candlesCurrentSession.length > 0) {
        const lastCandleCurrentSession = candlesCurrentSession[candlesCurrentSession.length - 1];
        const bodySize = Math.abs(lastCandleCurrentSession.close - lastCandleCurrentSession.open);
        const totalRange = lastCandleCurrentSession.high - lastCandleCurrentSession.low;
        if (totalRange > 0 && bodySize / totalRange < 0.2) {
          mainTrend.isDojiAfterBreakout = true;
        }
      }

      return {
        symbol,
        closes,
        rsi14,
        priceChangePercent,
        mainTrend,
        prevClosedGreen,
        prevClosedRed,
        highestVolumeColorPrev,
      };
    };

    const processBatch = async () => {
      if (!isMounted) return;
      if (symbols.length === 0) {
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
        symbols.slice(currentIndex, currentIndex + BATCH_SIZE).map((symbol: string) => fetchAndAnalyze(symbol, timeframe))
      );
      if (isMounted) {
        setSignals((prev) => [...prev, ...newSignals.filter(Boolean) as SignalData[]]);
        currentIndex += BATCH_SIZE;
        setLastUpdated(new Date().toLocaleTimeString());
        if (currentIndex < symbols.length) {
          setTimeout(processBatch, INTERVAL_MS);
        } else {
          setLoading(false);
        }
      }
    };
    setSignals([]);
    setLoading(true);
    currentIndex = 0;
    symbols = [];
    setLastUpdated(null);
    processBatch();
    return () => {
      isMounted = false;
    };
  }, [timeframe]);


  const bullFlagSymbols = useMemo(() => {
    return signals.filter(s => {
      if (!s.rsi14 || s.rsi14.length < 1 || !s.closes || s.closes.length < 200) return false;

      const signal = getSignal(s);
      if (signal !== 'MAX ZONE PUMP') return false;

      const ema5 = calculateEMA(s.closes, 5).at(-1);
      const ema10 = calculateEMA(s.closes, 10).at(-1);
      const ema20 = calculateEMA(s.closes, 20).at(-1);
      const ema50 = calculateEMA(s.closes, 50).at(-1);
      const rsi = s.rsi14.at(-1);

      const isBullishEma = ema5! > ema10! && ema10! > ema20! && ema20! > ema50!;
      return isBullishEma && rsi! > 50;
    });
  }, [signals]);

  const bearFlagSymbols = useMemo(() => {
    return signals.filter(s => {
      if (!s.rsi14 || s.rsi14.length < 1 || !s.closes || s.closes.length < 200) return false;

      const signal = getSignal(s);
      if (signal !== 'MAX ZONE DUMP') return false;

      const ema5 = calculateEMA(s.closes, 5).at(-1);
      const ema10 = calculateEMA(s.closes, 10).at(-1);
      const ema20 = calculateEMA(s.closes, 20).at(-1);
      const ema50 = calculateEMA(s.closes, 50).at(-1);
      const rsi = s.rsi14.at(-1);

      const isBearishEma = ema5! < ema10! && ema10! < ema20! && ema20! < ema50!;
      return isBearishEma && rsi! < 50;
    });
  }, [signals]);

  const marketStats = useMemo(() => {
    const greenPriceChangeCount = signals.filter(
      (t) => parseFloat(String(t.priceChangePercent)) > 0
    ).length;

    const redPriceChangeCount = signals.filter(
      (t) => parseFloat(String(t.priceChangePercent)) < 0
    ).length;

    const greenVolumeCount = signals.filter(
      (s) => s.highestVolumeColorPrev === 'green'
    ).length;

    const redVolumeCount = signals.filter(
      (s) => s.highestVolumeColorPrev === 'red'
    ).length;

    const bullishTrendCount = signals.filter(
      (s) => s.mainTrend && s.mainTrend.trend === 'bullish'
    ).length;

    const bearishTrendCount = signals.filter(
      (s) => s.mainTrend && s.mainTrend.trend === 'bearish'
    ).length;

    const maxPumpZoneCount = signals.filter(s => getSignal(s) === 'MAX ZONE PUMP').length;
    const maxDumpZoneCount = signals.filter(s => getSignal(s) === 'MAX ZONE DUMP').length;

    const bullFlagCount = bullFlagSymbols.length;
    const bearFlagCount = bearFlagSymbols.length;

    return {
      greenPriceChangeCount,
      redPriceChangeCount,
      greenVolumeCount,
      redVolumeCount,
      bullishTrendCount,
      bearishTrendCount,
      maxPumpZoneCount,
      maxDumpZoneCount,
      bullFlagCount,
      bearFlagCount,
    };
  }, [signals, bullFlagSymbols, bearFlagSymbols]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-purple-400 mb-6 text-center">
          Crypto Signals Dashboard 🚀
        </h1>

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

        <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 mb-8 border border-blue-700">
          <h2 className="text-xl sm:text-2xl font-bold text-blue-300 mb-4 text-center">
            Market Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 text-center">
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
            <div className="p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400">Bullish Trend</p>
              <p className="text-lg font-semibold text-green-400">{marketStats.bullishTrendCount}</p>
            </div>
            <div className="p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400">Bearish Trend</p>
              <p className="text-lg font-semibold text-red-400">{marketStats.bearishTrendCount}</p>
            </div>
            <div className="p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400">Bull Flag</p>
              <p className="text-lg font-semibold text-blue-400">{marketStats.bullFlagCount}</p>
            </div>
            <div className="p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400">Bear Flag</p>
              <p className="text-lg font-semibold text-orange-400">{marketStats.bearFlagCount}</p>
            </div>
            <div className="p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400">Max Zone Pump</p>
              <p className="text-lg font-semibold text-purple-400">{marketStats.maxPumpZoneCount}</p>
            </div>
            <div className="p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400">Max Zone Dump</p>
              <p className="text-lg font-semibold text-purple-400">{marketStats.maxDumpZoneCount}</p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center text-lg text-gray-400 mt-10">
            Loading signals... This might take a moment. ⏳
          </div>
        )}

        {!loading && bullFlagSymbols.length > 0 && (
          <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 mb-8 border border-blue-700">
            <h2 className="text-2xl sm:text-3xl font-bold text-blue-300 mb-5 text-center">
              Bull Flag Signals ({bullFlagSymbols.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Current Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">24h Change (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {bullFlagSymbols.map((s) => (
                    <tr key={s.symbol}>
                      <td className="px-4 py-4 text-blue-200 font-medium">{s.symbol}</td>
                      <td className="px-4 py-4 text-gray-200">${s.closes.at(-1)?.toFixed(2) || 'N/A'}</td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${s.priceChangePercent > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {s.priceChangePercent?.toFixed(2) || 'N/A'}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && bearFlagSymbols.length > 0 && (
          <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 mb-8 border border-orange-700">
            <h2 className="text-2xl sm:text-3xl font-bold text-orange-300 mb-5 text-center">
              Bear Flag Signals ({bearFlagSymbols.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Current Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">24h Change (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {bearFlagSymbols.map((s) => (
                    <tr key={s.symbol}>
                      <td className="px-4 py-4 text-orange-200 font-medium">{s.symbol}</td>
                      <td className="px-4 py-4 text-gray-200">${s.closes.at(-1)?.toFixed(2) || 'N/A'}</td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${s.priceChangePercent > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {s.priceChangePercent?.toFixed(2) || 'N/A'}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && bullFlagSymbols.length === 0 && bearFlagSymbols.length === 0 && (
          <div className="text-center text-lg text-gray-400 mt-10">
            No Bull or Bear Flag signals found for the selected timeframe.
          </div>
        )}
      </div>
      <FlagSignalsDashboard />
    </div>
  );
}
