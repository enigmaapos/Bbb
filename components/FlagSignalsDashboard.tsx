import React, { useState, useEffect, useMemo, useRef } from 'react';

// --- Utility Functions ---
/**
 * Copies text to the clipboard.
 * @param text The text to copy.
 */
const copyToClipboard = (text: string) => {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
};

// --- Type Definitions for both components ---
/**
 * Defines the structure of a single candlestick.
 */
type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
};

/**
 * Defines the structure for the main trend analysis.
 */
interface MainTrend {
  trend: 'bullish' | 'bearish' | 'neutral';
  type: 'support' | 'resistance' | 'none';
  crossoverPrice: number;
  breakout: 'bullish' | 'bearish' | null;
  isNear: boolean;
  isDojiAfterBreakout: boolean;
}

/**
 * Defines the complete signal data for a given symbol.
 */
interface SignalData {
  symbol: string;
  closes: number[];
  rsi14: number[];
  priceChangePercent: number;
  mainTrend: MainTrend;
  prevClosedGreen: boolean | null;
  prevClosedRed: boolean | null;
  highestVolumeColorPrev: 'green' | 'red' | null;
  flagSignal: 'Bull Flag' | 'Bear Flag' | 'Neutral' | null;
}

/**
 * Defines the structure for various metrics calculated from candles.
 */
interface Metrics {
  price: number;
  prevSessionHigh: number;
  prevSessionLow: number;
  todaysHighestHigh: number;
  todaysLowestLow: number;
  ema5: number;
  ema10: number;
  ema20: number;
  ema50: number;
  rsi: number;
  mainTrend: {
    breakout: 'bullish' | 'bearish' | null;
    isDojiAfterBreakout: boolean;
  };
}

// --- API Fetching with Rate Limiting and Exponential Backoff ---
// Using a CORS proxy to bypass potential security blocks
const PROXY_URLS = [
  'https://proxy.cors.sh/?', // New, primary proxy
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/'
];

const throttle = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

/**
 * Fetches data with built-in rate limiting and exponential backoff.
 * @param url The URL to fetch.
 * @param retries The number of times to retry.
 * @param delay The initial delay in milliseconds.
 * @returns The fetched response.
 */
const fetchWithRateLimit = async (
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> => {
  for (const proxyUrl of PROXY_URLS) {
    try {
      const proxiedUrl = proxyUrl + encodeURIComponent(url);
      const response = await fetch(proxiedUrl);
  
      if (response.status === 429 && retries > 0) {
        console.warn(`Rate limit hit, retrying in ${delay}ms...`);
        await throttle(delay);
        return fetchWithRateLimit(url, retries - 1, delay * 2);
      }
      if (response.status === 403) {
        console.warn(`Proxy failed, trying next one...`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      console.warn(`Fetch failed with current proxy, retrying with next one...`);
      continue;
    }
  }

  // If all proxies fail, try the original URL one more time
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } catch (error) {
    throw new Error(`All fetch attempts failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Fetches all USDT perpetual futures symbols from Binance.
 * @returns A promise that resolves to an array of symbol strings.
 */
const fetchFuturesSymbols = async (): Promise<string[]> => {
  try {
    const response = await fetchWithRateLimit('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const data = await response.json();
    if (!data || !data.symbols || !Array.isArray(data.symbols)) {
      console.error('Invalid exchange info response:', data);
      return [];
    }
    const usdtPerpetualSymbols = data.symbols
      .filter(
        (s: any) =>
          s.contractType === 'PERPETUAL' &&
          s.quoteAsset === 'USDT' &&
          s.status === 'TRADING'
      )
      .map((s: any) => s.symbol);
    return usdtPerpetualSymbols;
  } catch (error) {
    console.error('Error fetching futures symbols:', error);
    return [];
  }
};

/**
 * Fetches candlestick data for a given symbol and interval.
 * @param symbol The trading symbol (e.g., 'BTCUSDT').
 * @param interval The candlestick interval (e.g., '15m', '4h', '1d').
 * @returns A promise that resolves to an array of Candle objects.
 */
const fetchCandleData = async (
  symbol: string,
  interval: string
): Promise<Candle[]> => {
  try {
    const response = await fetchWithRateLimit(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=1000`
    );
    const data = await response.json();
    if (!Array.isArray(data)) {
      console.error(`Invalid klines response for ${symbol}:`, data);
      return [];
    }
    return data.map((d: any[]) => ({
      timestamp: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
      openTime: d[0],
    }));
  } catch (error) {
    console.error(`Error fetching candle data for ${symbol}:`, error);
    return [];
  }
};

// --- Analytic Utility Functions ---
/**
 * Calculates the Exponential Moving Average (EMA).
 */
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  ema[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] * k) + (ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * Calculates the Relative Strength Index (RSI).
 */
function calculateRSI(closes: number[], period = 14): number[] {
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

const getMillis = (timeframe: string) => {
  switch (timeframe) {
    case '15m': return 15 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
};

const getSessions = (timeframe: string, nowMillis: number) => {
  const tfMillis = getMillis(timeframe);
  let currentSessionStart;
  
  if (timeframe === '1d') {
    // Custom daily session starting at 8 AM Philippine Time (UTC+8)
    const phTimeOffset = 8 * 60 * 60 * 1000;
    const today = new Date(nowMillis + phTimeOffset);
    today.setUTCHours(8, 0, 0, 0);
    currentSessionStart = today.getTime() - phTimeOffset;
    if (nowMillis < currentSessionStart) {
      currentSessionStart -= 24 * 60 * 60 * 1000;
    }
  } else {
    currentSessionStart = Math.floor(nowMillis / tfMillis) * tfMillis;
  }

  const prevSessionStart = currentSessionStart - tfMillis;
  return { currentSessionStart, prevSessionStart };
};

const isDoji = (candle: Candle) => {
  const bodySize = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;
  return totalRange > 0 && (bodySize / totalRange) < 0.2;
};

const calculateMetrics = (candles: Candle[], timeframe: string): Metrics | null => {
  if (!candles || candles.length < 2) return null;

  const nowMillis = Date.now();
  const { currentSessionStart, prevSessionStart } = getSessions(timeframe, nowMillis);

  const prevSessionCandles = candles.filter(c => c.openTime >= prevSessionStart && c.openTime < currentSessionStart);
  const currentSessionCandles = candles.filter(c => c.openTime >= currentSessionStart);

  if (prevSessionCandles.length === 0 || currentSessionCandles.length === 0) return null;

  const prevSessionHigh = Math.max(...prevSessionCandles.map(c => c.high));
  const prevSessionLow = Math.min(...prevSessionCandles.map(c => c.low));
  
  const todaysHighestHigh = Math.max(...currentSessionCandles.map(c => c.high));
  const todaysLowestLow = Math.min(...currentSessionCandles.map(c => c.low));
  
  const lastCandle = currentSessionCandles[currentSessionCandles.length - 1];

  const mainTrend = {
    breakout: null as 'bullish' | 'bearish' | null,
    isDojiAfterBreakout: false,
  };

  const isDojiAfterBreakout = isDoji(lastCandle);
  
  if (todaysHighestHigh > prevSessionHigh) {
    mainTrend.breakout = 'bullish';
    mainTrend.isDojiAfterBreakout = isDojiAfterBreakout;
  }
  
  if (todaysLowestLow < prevSessionLow) {
    mainTrend.breakout = 'bearish';
    mainTrend.isDojiAfterBreakout = isDojiAfterBreakout;
  }

  const ema = (candles: Candle[], period: number) => {
    if (candles.length < period) return [];
    const alpha = 2 / (period + 1);
    let emaValues: number[] = [];
    // Calculate initial SMA for the first EMA
    const initialSMA = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
    emaValues.push(initialSMA);
    for (let i = period; i < candles.length; i++) {
      const prevEma = emaValues[i - period];
      const newEma = (candles[i].close - prevEma) * alpha + prevEma;
      emaValues.push(newEma);
    }
    return emaValues;
  };
  
  const ema5 = ema(candles, 5);
  const ema10 = ema(candles, 10);
  const ema20 = ema(candles, 20);
  const ema50 = ema(candles, 50);
  
  const lastEma5 = ema5[ema5.length - 1];
  const lastEma10 = ema10[ema10.length - 1];
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];

  const getRSI = (candles: Candle[], period = 14) => {
    if (candles.length < period) return null;
    let gains = 0;
    let losses = 0;
  
    for (let i = 1; i < period; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }
  
    let avgGain = gains / period;
    let avgLoss = losses / period;
  
    for (let i = period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
  
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };
  
  const rsi = getRSI(candles);

  return {
    price: lastCandle.close,
    prevSessionHigh,
    prevSessionLow,
    todaysHighestHigh,
    todaysLowestLow,
    ema5: lastEma5,
    ema10: lastEma10,
    ema20: lastEma20,
    ema50: lastEma50,
    rsi: rsi !== null ? rsi : NaN,
    mainTrend,
  };
};

// --- Flag Signals Dashboard Component ---
const FlagSignalsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [timeframe, setTimeframe] = useState('4h');
  const [bullishBreakoutSymbols, setBullishBreakoutSymbols] = useState<string[]>([]);
  const [bearishBreakoutSymbols, setBearishBreakoutSymbols] = useState<string[]>([]);
  const [bullFlagSymbols, setBullFlagSymbols] = useState<string[]>([]);
  const [bearFlagSymbols, setBearFlagSymbols] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAllSignals = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const allSymbols = await fetchFuturesSymbols();
      const newBullishBreakouts: string[] = [];
      const newBearishBreakouts: string[] = [];
      const newBullFlags: string[] = [];
      const newBearFlags: string[] = [];

      // Process symbols in a batched, rate-limited manner
      const BATCH_SIZE = 50;
      for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
        const batch = allSymbols.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (symbol) => {
          try {
            const candles = await fetchCandleData(symbol, timeframe);
            const metrics = calculateMetrics(candles, timeframe);
            if (!metrics) return;

            // Trend analysis
            if (metrics.mainTrend.breakout === 'bullish' && !metrics.mainTrend.isDojiAfterBreakout) {
              newBullishBreakouts.push(symbol);
            }
            if (metrics.mainTrend.breakout === 'bearish' && !metrics.mainTrend.isDojiAfterBreakout) {
              newBearishBreakouts.push(symbol);
            }

            // Flag analysis (simplified for this example)
            const rsiValues = calculateRSI(candles.map(c => c.close));
            const lastRsi = rsiValues[rsiValues.length - 1];
            if (metrics.mainTrend.breakout === 'bullish' && lastRsi < 70) {
              newBullFlags.push(symbol);
            }
            if (metrics.mainTrend.breakout === 'bearish' && lastRsi > 30) {
              newBearFlags.push(symbol);
            }
          } catch (error) {
            console.error(`Failed to fetch data for ${symbol}:`, error);
          }
        }));
        await throttle(2000); // Wait for 2 seconds between batches
      }

      setBullishBreakoutSymbols(newBullishBreakouts);
      setBearishBreakoutSymbols(newBearishBreakouts);
      setBullFlagSymbols(newBullFlags);
      setBearFlagSymbols(newBearFlags);

    } catch (error) {
      setErrorMessage(`Failed to fetch symbols: ${error instanceof Error ? error.message : String(error)}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSignals();
  }, [timeframe]);

  const filterSymbols = (symbols: string[]) => {
    if (!searchQuery) {
      return symbols;
    }
    const lowerCaseQuery = searchQuery.toLowerCase();
    return symbols.filter(symbol => symbol.toLowerCase().includes(lowerCaseQuery));
  };

  const renderSymbolsList = (title: string, symbols: string[], buttonClass: string) => (
    <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
      <h3 className="text-xl font-bold text-center mb-4 text-white">{title} ({symbols.length})</h3>
      <div className="max-h-96 overflow-y-auto">
        <ul className="space-y-2">
          {symbols.map(symbol => (
            <li key={symbol} className="flex items-center justify-between p-3 rounded-lg bg-gray-700 transition duration-200 ease-in-out hover:bg-gray-600">
              <span className="text-gray-200 font-medium">{symbol}</span>
              <button
                onClick={() => copyToClipboard(symbol)}
                className={`flex items-center justify-center p-2 rounded-lg text-white transition-colors duration-200 ease-in-out ${buttonClass}`}
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-8 flex flex-col items-center">
      <div className="w-full max-w-6xl">
        <header className="text-center mb-8">
          <h1 className="text-5xl font-extrabold text-white leading-tight mb-2">Crypto Signals Dashboard</h1>
          <p className="text-lg text-gray-400">
            Real-time analysis of USDT Perpetual Futures.
          </p>
        </header>

        <div className="flex flex-col md:flex-row justify-between items-center bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700 mb-8">
          <div className="flex-grow flex items-center bg-gray-700 rounded-lg p-2 mb-4 md:mb-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search symbols..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-0 text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-1 rounded-full text-gray-400 hover:text-white transition-colors duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex space-x-2">
            {['15m', '4h', '1d'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`py-2 px-4 rounded-lg font-semibold transition-colors duration-200 ${
                  timeframe === tf
                    ? 'bg-teal-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-[50vh]">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-teal-500"></div>
          </div>
        ) : errorMessage ? (
          <div className="bg-red-900 border-l-4 border-red-500 text-red-200 p-4 rounded-lg">
            <p>{errorMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {renderSymbolsList('Bullish Breakouts', filterSymbols(bullishBreakoutSymbols), 'bg-green-600 hover:bg-green-500')}
            {renderSymbolsList('Bearish Breakouts', filterSymbols(bearishBreakoutSymbols), 'bg-red-600 hover:bg-red-500')}
            {renderSymbolsList('Bull Flags', filterSymbols(bullFlagSymbols), 'bg-blue-600 hover:bg-blue-500')}
            {renderSymbolsList('Bear Flags', filterSymbols(bearFlagSymbols), 'bg-orange-600 hover:bg-orange-500')}
          </div>
        )}

        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>Data provided by Binance Futures API.</p>
        </footer>
      </div>
    </div>
  );
};

export default FlagSignalsDashboard;
