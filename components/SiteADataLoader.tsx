import React, { useState, useEffect, useMemo, useRef } from 'react';

// --- Utility Functions ---
const copyToClipboard = (text: string) => {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
};

// --- Type Definitions for both components ---
type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
};

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
  flagSignal: 'Bull Flag' | 'Bear Flag' | 'Neutral' | null;
}

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
const throttle = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

const fetchWithRateLimit = async (
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> => {
  try {
    const response = await fetch(url);
    if (response.status === 429 && retries > 0) {
      console.warn(`Rate limit hit, retrying in ${delay}ms...`);
      await throttle(delay);
      return fetchWithRateLimit(url, retries - 1, delay * 2);
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch failed, retrying in ${delay}ms...`);
      await throttle(delay);
      return fetchWithRateLimit(url, retries - 1, delay * 2);
    }
    throw error;
  }
};

const fetchFuturesSymbols = async (): Promise<string[]> => {
  const response = await fetchWithRateLimit('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const data = await response.json();
  const usdtPerpetualSymbols = data.symbols
    .filter(
      (s: any) =>
        s.contractType === 'PERPETUAL' &&
        s.quoteAsset === 'USDT' &&
        s.status === 'TRADING'
    )
    .map((s: any) => s.symbol);
  return usdtPerpetualSymbols;
};

const fetchCandleData = async (
  symbol: string,
  interval: string
): Promise<Candle[]> => {
  const response = await fetchWithRateLimit(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=1000`
  );
  const data = await response.json();
  return data.map((d: any[]) => ({
    timestamp: d[0],
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
    openTime: d[0],
  }));
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

/**
 * Determines a trading signal based on RSI pump/dump zones.
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
  if (dumpInRange_21_26 && direction === 'dump') return 'LOWEST ZONE DUMP';
  return 'NO STRONG SIGNAL';
};

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
      avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
      avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
    }
    const rs = avgLoss === 0 ? 999 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return rsi;
  };
  const rsi = getRSI(candles, 14);
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
    rsi: rsi!,
    mainTrend,
  };
};

const checkBullFlag = (candles: Candle[]): boolean => {
  if (candles.length < 50) return false;
  const closes = candles.map(c => c.close);
  const ema5 = calculateEMA(closes, 5);
  const ema10 = calculateEMA(closes, 10);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const lastEma5 = ema5[ema5.length - 1];
  const lastEma10 = ema10[ema10.length - 1];
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];

  return lastEma5 > lastEma10 && lastEma10 > lastEma20 && lastEma20 > lastEma50;
};

const checkBearFlag = (candles: Candle[]): boolean => {
  if (candles.length < 50) return false;
  const closes = candles.map(c => c.close);
  const ema5 = calculateEMA(closes, 5);
  const ema10 = calculateEMA(closes, 10);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const lastEma5 = ema5[ema5.length - 1];
  const lastEma10 = ema10[ema10.length - 1];
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];

  return lastEma5 < lastEma10 && lastEma10 < lastEma20 && lastEma20 < lastEma50;
};

// --- Main App Component that combines both dashboards ---
export default function App() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [symbolsData, setSymbolsData] = useState<Record<string, { candles: Candle[], metrics: Metrics | null }>>({});
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('15m');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fetchIntervalRef = useRef<number | null>(null);

  // Function to process a single symbol's data for the table
  const processSymbolData = async (symbol: string): Promise<SignalData | null> => {
    try {
      const candles = await fetchCandleData(symbol, '15m'); // Use a default interval for this table
      const closes = candles.map(c => c.close);
      const rsi14 = calculateRSI(closes, 14);
      
      if (candles.length < 2) return null;

      const latestCandle = candles[candles.length - 1];
      const previousCandle = candles[candles.length - 2];
      
      const priceChangePercent = ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100;
      const rsiSignal = getSignal({ rsi14 });

      const isBullFlag = checkBullFlag(candles);
      const isBearFlag = checkBearFlag(candles);
      const flagSignal = isBullFlag ? 'Bull Flag' : isBearFlag ? 'Bear Flag' : 'Neutral';

      const mainTrend: MainTrend = {
        trend: 'neutral',
        type: 'none',
        crossoverPrice: 0,
        breakout: null,
        isNear: false,
        isDojiAfterBreakout: false,
      };

      const prevClosedGreen = previousCandle.close > previousCandle.open;
      const prevClosedRed = previousCandle.close < previousCandle.open;

      const highestVolumeColorPrev: 'green' | 'red' | null = 
        previousCandle.volume > candles[candles.length - 3]?.volume
        ? (previousCandle.close > previousCandle.open ? 'green' : 'red')
        : null;

      return {
        symbol,
        closes,
        rsi14,
        priceChangePercent,
        mainTrend,
        prevClosedGreen,
        prevClosedRed,
        highestVolumeColorPrev,
        flagSignal,
      };
    } catch (error) {
      console.error(`Error processing data for ${symbol}:`, error);
      return null;
    }
  };

  // Fetch data for the main table
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Fetch symbols to display in the table. You can customize this list.
        const processedSignals = await Promise.all(symbols.map(processSymbolData));
      const filteredSignals = processedSignals.filter((s): s is SignalData => s !== null);
      setSignals(filteredSignals);
      setLoading(false);
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Fetch data for the flag dashboard
  const fetchDataForFlags = async (symbolsToFetch: string[]) => {
    setLoading(true);
    setErrorMessage(null);
    const newData: Record<string, { candles: Candle[], metrics: Metrics | null }> = {};
    const batchSize = 10;
    const delay = 1000;
    for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
      const batch = symbolsToFetch.slice(i, i + batchSize);
      await Promise.all(batch.map(async symbol => {
        try {
          const candles = await fetchCandleData(symbol, timeframe);
          newData[symbol] = {
            candles,
            metrics: calculateMetrics(candles, timeframe)
          };
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error);
          setErrorMessage(`Failed to fetch data for some symbols. It's likely a rate-limit issue. Please try again later.`);
        }
      }));
      setSymbolsData(prevData => ({ ...prevData, ...newData }));
      if (i + batchSize < symbolsToFetch.length) {
        await throttle(delay);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedSymbols = await fetchFuturesSymbols();
        setSymbols(fetchedSymbols);
        await fetchDataForFlags(fetchedSymbols);

        if (fetchIntervalRef.current) {
          clearInterval(fetchIntervalRef.current);
        }
        fetchIntervalRef.current = window.setInterval(() => fetchDataForFlags(fetchedSymbols), 60000); // Refresh every minute
      } catch (error) {
        console.error('Initial data load failed:', error);
        setErrorMessage('Failed to load initial data. Please try again.');
        setLoading(false);
      }
    };
    loadData();
    return () => {
      if (fetchIntervalRef.current) {
        window.clearInterval(fetchIntervalRef.current);
      }
    };
  }, [timeframe]);

  const bullFlagSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol].metrics;
      if (!s) return false;
      const { ema5, ema10, ema20, ema50, rsi } = s;
      const isBullishEma = ema5 > ema10 && ema10 > ema20 && ema20 > ema50;
      return isBullishEma && rsi > 50;
    });
  }, [symbolsData]);

  const bearFlagSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol].metrics;
      if (!s) return false;
      const { ema5, ema10, ema20, ema50, rsi } = s;
      const isBearishEma = ema5 < ema10 && ema10 < ema20 && ema20 < ema50;
      return isBearishEma && rsi < 50;
    });
  }, [symbolsData]);

  const bullishBreakoutSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol].metrics;
      return s && s.mainTrend && s.mainTrend.breakout === 'bullish';
    });
  }, [symbolsData]);

  const bearishBreakoutSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol].metrics;
      return s && s.mainTrend && s.mainTrend.breakout === 'bearish';
    });
  }, [symbolsData]);

  const filterSymbols = (symbols: string[]) => {
    return symbols.filter(symbol =>
      symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };
  
  const renderSymbolsList = (title: string, symbols: string[], color: string) => (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-xl flex-1 min-w-[300px] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold">{title} ({symbols.length})</h3>
        <button
          onClick={() => copyToClipboard(symbols.join(', '))}
          className="text-gray-400 hover:text-white transition-colors duration-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v4.586a1 1 0 00.293.707l2.121 2.121a1 1 0 001.414 0l2.121-2.121a1 1 0 00.293-.707V7m-6 0h6m-6 0H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2m-8 0V4a2 2 0 012-2h2a2 2 0 012 2v3m-6 0h6" />
          </svg>
        </button>
      </div>
      <div className="overflow-y-auto max-h-[300px] space-y-2">
        {symbols.length > 0 ? (
          symbols.map(symbol => (
            <div key={symbol} className={`px-4 py-2 rounded-lg text-lg font-medium text-white ${color}`}>
              {symbol}
            </div>
          ))
        ) : (
          <p className="text-gray-500">No symbols found.</p>
        )}
      </div>
    </div>
  );

  const signalTable = useMemo(() => {
    return signals.map(s => {
      const currentPrice = s.closes[s.closes.length - 1]?.toFixed(2) || 'N/A';
      const pumpDump = {
        pumpStrength: s.closes[s.closes.length - 1] > s.closes[s.closes.length - 10]
          ? (s.closes[s.closes.length - 1] / s.closes[s.closes.length - 10]) * 100
          : 0,
      };
      
      let flagSignalColor = 'text-gray-400';
      if (s.flagSignal === 'Bull Flag') {
        flagSignalColor = 'text-green-400';
      } else if (s.flagSignal === 'Bear Flag') {
        flagSignalColor = 'text-red-400';
      }

      return (
        <tr key={s.symbol}>
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
          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
            <span className={flagSignalColor}>{s.flagSignal || 'N/A'}</span>
          </td>
        </tr>
      );
    });
  }, [signals]);

  return (
    <div className="bg-gray-900 min-h-screen font-sans text-white">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #2d3748;
        }
        ::-webkit-scrollbar-thumb {
          background: #4a5568;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #718096;
        }
      `}</style>
      <header className="py-8 text-center bg-gray-800 text-white">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 mb-2">
          Master Crypto Dashboard
        </h1>
        <p className="text-gray-400">A unified view of crypto market signals and price data.</p>
      </header>
      
      <div className="container mx-auto p-4">
        {/* CryptoPricesTable Section */}
        <div className="container mx-auto p-4 rounded-lg shadow-lg bg-gray-800">
          <h1 className="text-3xl font-bold mb-6 text-center text-purple-400">Crypto Signals Dashboard</h1>
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
              <p className="ml-4 text-xl text-purple-300">Loading data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="bg-gray-700 rounded-lg p-2">
                <table className="min-w-full divide-y divide-gray-600">
                  <thead className="bg-gray-600">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Symbol
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Current Price
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Change (24h)
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Pump Strength
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Prev Volume Color
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Flag Signal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {signalTable}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        
        {/* FlagSignalsDashboard Section */}
        <div className="mt-8">
          <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
            <div className="max-w-7xl mx-auto">
              <header className="mb-8 text-center">
                <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 mb-2">
                  Flag Signal Dashboard
                </h1>
                <p className="text-gray-400 text-lg">Real-time market analysis for top perpetual USDT pairs on Binance Futures.</p>
              </header>
              <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-8">
                <div className="flex space-x-2 bg-gray-800 p-2 rounded-xl shadow-inner">
                  <button
                    onClick={() => setTimeframe('15m')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeframe === '15m' ? 'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                  >
                    15m
                  </button>
                  <button
                    onClick={() => setTimeframe('4h')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeframe === '4h' ? 'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                  >
                    4h
                  </button>
                  <button
                    onClick={() => setTimeframe('1d')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeframe === '1d' ? 'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                  >
                    1d
                  </button>
                </div>
                <div className="relative w-full md:w-64">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search symbols..."
                    className="w-full pl-4 pr-10 py-2 rounded-xl bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
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
        </div>
      </div>
    </div>
  );
}
