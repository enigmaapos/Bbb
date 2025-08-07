import React, { useState, useEffect, useMemo, useRef } from 'react';

// Use this for clipboard functionality
const copyToClipboard = (text: string) => {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
};

const getMillis = (timeframe: string) => {
  switch (timeframe) {
    case '15m': return 15 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
};

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
    trend: 'bullish' | 'bearish' | 'neutral';
    breakout: 'bullish' | 'bearish' | null;
    isNear: boolean;
  };
  isBullFlag: boolean;
  isBearFlag: boolean;
}

interface SymbolData {
  symbol: string;
  metrics: Metrics | null;
}

// Utility functions
const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let previousEma: number | undefined;

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      // For the initial data points, we don't have enough history for an EMA
      emaArray.push(NaN);
      continue;
    }

    if (i === period) {
      // Calculate the initial SMA for the first EMA value
      const sma = data.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
      previousEma = sma;
      emaArray.push(sma);
      continue;
    }

    if (previousEma !== undefined) {
      const currentEma = (data[i] - previousEma) * k + previousEma;
      emaArray.push(currentEma);
      previousEma = currentEma;
    }
  }

  return emaArray;
};

const calculateRSI = (closes: number[], period: number): number => {
  if (closes.length < period + 1) {
    return NaN;
  }
  const lastPeriodCloses = closes.slice(-period - 1);
  const changes: number[] = lastPeriodCloses.slice(1).map((price, index) => price - lastPeriodCloses[index]);
  const gains = changes.filter(c => c > 0).reduce((sum, c) => sum + c, 0) / period;
  const losses = changes.filter(c => c < 0).reduce((sum, c) => sum + Math.abs(c), 0) / period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
};

const getSessions = (timeframe: string, now: Date) => {
  if (timeframe === '1d') {
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
    const tfMillis = MILLISECONDS[timeframe];
    const sessionStart = Math.floor(nowMillis / tfMillis) * tfMillis;
    const sessionEnd = sessionStart + tfMillis;
    const prevSessionStart = sessionStart - tfMillis;
    const prevSessionEnd = sessionStart;
    return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
  }
};

const fetchWithRetry = async (url: string, retries = 5, delay = 1000) => {
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
        throw error;
      }
    }
  }
  return null;
};

// Main component
const FlagSignalsDashboard: React.FC = () => {
  const [timeframe, setTimeframe] = useState('1d');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [data, setData] = useState<SymbolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const allSignals = useMemo(() => data.filter(d => d.metrics?.isBullFlag || d.metrics?.isBearFlag), [data]);
  const bullishSignals = useMemo(() => allSignals.filter(s => s.metrics?.isBullFlag), [allSignals]);
  const bearishSignals = useMemo(() => allSignals.filter(s => s.metrics?.isBearFlag), [allSignals]);

  const fetchSignals = useRef(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const exchangeInfo = await fetchWithRetry('https://fapi.binance.com/fapi/v1/exchangeInfo');
      const symbolsToFetch: string[] = exchangeInfo.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol)
        .slice(0, 50);

      const fetchedDataPromises = symbolsToFetch.map(async (symbol) => {
        const klines = await fetchWithRetry(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=100`);

        if (!klines) return { symbol, metrics: null };

        const candles: Candle[] = klines.map((k: any) => ({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));

        const closes = candles.map(c => c.close);
        const lastClose = closes[closes.length - 1];

        const ema5 = calculateEMA(closes, 5);
        const ema10 = calculateEMA(closes, 10);
        const ema20 = calculateEMA(closes, 20);
        const ema50 = calculateEMA(closes, 50);
        const rsi = calculateRSI(closes, 14);

        const isBullFlag = (ema5.at(-1)! > ema10.at(-1)! && ema10.at(-1)! > ema20.at(-1)! && ema20.at(-1)! > ema50.at(-1)! && rsi > 50);
        const isBearFlag = (ema5.at(-1)! < ema10.at(-1)! && ema10.at(-1)! < ema20.at(-1)! && ema20.at(-1)! < ema50.at(-1)! && rsi < 50);

        const now = new Date();
        const { prevSessionHigh, prevSessionLow, sessionStart, sessionEnd } = getSessions(timeframe, now);
        const todaysCandles = candles.filter(c => c.openTime >= sessionStart && c.openTime <= sessionEnd);
        const todaysHighestHigh = Math.max(...todaysCandles.map(c => c.high));
        const todaysLowestLow = Math.min(...todaysCandles.map(c => c.low));

        const mainTrend = {
          trend: 'neutral',
          breakout: null as 'bullish' | 'bearish' | null,
          isNear: false,
        };

        if (ema5.at(-1)! > ema10.at(-1)!) mainTrend.trend = 'bullish';
        else if (ema5.at(-1)! < ema10.at(-1)!) mainTrend.trend = 'bearish';

        if (todaysHighestHigh > prevSessionHigh) mainTrend.breakout = 'bullish';
        else if (todaysLowestLow < prevSessionLow) mainTrend.breakout = 'bearish';

        return {
          symbol,
          metrics: {
            price: lastClose,
            prevSessionHigh,
            prevSessionLow,
            todaysHighestHigh,
            todaysLowestLow,
            ema5: ema5.at(-1)!,
            ema10: ema10.at(-1)!,
            ema20: ema20.at(-1)!,
            ema50: ema50.at(-1)!,
            rsi,
            mainTrend,
            isBullFlag: isBullFlag && !isNaN(isBullFlag),
            isBearFlag: isBearFlag && !isNaN(isBearFlag)
          }
        };
      });

      const fetchedData = await Promise.all(fetchedDataPromises);
      setData(fetchedData.filter(d => d.metrics !== null) as SymbolData[]);
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Error fetching data:", error);
      setErrorMessage('Failed to fetch data. Please try again later.');
      setLoading(false);
    }
  });

  useEffect(() => {
    fetchSignals.current();
    const interval = setInterval(() => {
      fetchSignals.current();
    }, getMillis(timeframe));
    return () => clearInterval(interval);
  }, [timeframe]);

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
  };

  const renderSignalTable = (signals: SymbolData[], title: string) => (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-2xl font-bold ${title.includes('Bullish') ? 'text-green-400' : 'text-red-400'}`}>{title}</h3>
      </div>
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Symbol</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">RSI</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Trend</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Breakout</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {signals.map(s => (
              <tr key={s.symbol} className="hover:bg-gray-700 transition-colors duration-150">
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-white">{s.symbol}</td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                  ${s.metrics?.price.toFixed(2)}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                  {s.metrics?.rsi.toFixed(2)}
                </td>
                <td className={`px-4 py-4 whitespace-nowrap text-sm font-semibold ${s.metrics?.mainTrend.trend === 'bullish' ? 'text-green-400' : s.metrics?.mainTrend.trend === 'bearish' ? 'text-red-400' : 'text-gray-400'}`}>
                  {s.metrics?.mainTrend.trend.toUpperCase()}
                </td>
                <td className={`px-4 py-4 whitespace-nowrap text-sm font-semibold ${s.metrics?.mainTrend.breakout === 'bullish' ? 'text-green-400' : s.metrics?.mainTrend.breakout === 'bearish' ? 'text-red-400' : 'text-gray-400'}`}>
                  {s.metrics?.mainTrend.breakout ? s.metrics.mainTrend.breakout.toUpperCase() : 'N/A'}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => copyToClipboard(s.symbol)}
                    className="text-gray-400 hover:text-white transition-colors duration-200"
                    title="Copy symbol to clipboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                      <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 2 2 0 01-2 2H8a2 2 0 01-2-2zM11 11a1 1 0 100 2h1a1 1 0 100-2h-1z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center text-teal-400">Flag Signals Dashboard</h1>

        <div className="flex justify-between items-center mb-6">
          <div className="flex space-x-2">
            {['15m', '4h', '1d'].map(tf => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                className={`py-2 px-4 rounded-lg font-semibold transition-colors duration-200 ${
                  timeframe === tf
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <div className="text-sm text-gray-400">Last Updated: {lastUpdated}</div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-[50vh]">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-teal-500"></div>
          </div>
        ) : errorMessage ? (
          <div className="bg-red-900 border-l-4 border-red-500 text-red-200 p-4 rounded-md flex items-center justify-between">
            <p>{errorMessage}</p>
            <button onClick={() => setErrorMessage('')}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {renderSignalTable(bullishSignals, 'Bullish Flag Signals')}
            {renderSignalTable(bearishSignals, 'Bearish Flag Signals')}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlagSignalsDashboard;
