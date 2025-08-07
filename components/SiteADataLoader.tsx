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

// --- Type Definitions for both components ---
interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number; // Added for SiteADataLoader compatibility
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

// --- Utility Functions from SiteADataLoader.tsx ---
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
function calculateRSI(data: number[], period: number): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains[i - 1] = change > 0 ? change : 0;
    losses[i - 1] = change < 0 ? -change : 0;
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi[period] = 100 - (100 / (1 + rs));

  for (let i = period + 1; i < data.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i - 1]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i - 1]) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - (100 / (1 + rs));
  }
  return rsi;
}

// --- Utility Functions from FlagSignalsDashboard.tsx ---
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

// --- Mock API functions to replace the real ones ---
/**
 * Mocks fetching a list of perpetual USDT symbols.
 */
const mockFetchFuturesSymbols = async (): Promise<string[]> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT'];
};

/**
 * Mocks fetching candle data for a given list of symbols and timeframe.
 */
const mockFetchData = async (symbolsToFetch: string[], timeframe: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const newSymbolsData: Record<string, { candles: Candle[], metrics: Metrics | null }> = {};
  
  const getMockCandles = (symbol: string, intervalMillis: number): Candle[] => {
    const candles: Candle[] = [];
    let close = 100 + Math.random() * 50;
    for (let i = 0; i < 100; i++) {
      const open = close + (Math.random() - 0.5) * 2;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      close = low + Math.random() * (high - low);
      candles.push({
        openTime: Date.now() - (100 - i) * intervalMillis,
        open,
        high,
        low,
        close,
        volume: 100000 + Math.random() * 1000000,
        timestamp: Date.now() - (100 - i) * intervalMillis, // For SiteADataLoader
      });
    }
    return candles;
  };
  
  for (const symbol of symbolsToFetch) {
    const candles = getMockCandles(symbol, getMillis(timeframe));
    newSymbolsData[symbol] = {
      candles,
      metrics: calculateMetrics(candles, timeframe)
    };
  }
  return newSymbolsData;
};


// --- FlagSignalsDashboard Component ---
const FlagSignalsDashboard = () => {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolsData, setSymbolsData] = useState<Record<string, { candles: Candle[], metrics: Metrics | null }>>({});
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('15m');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fetchIntervalRef = useRef<number | null>(null);
  
  // Replaces the original fetchData with the mock version
  const fetchData = async (symbolsToFetch: string[]) => {
    try {
      setErrorMessage(null);
      const data = await mockFetchData(symbolsToFetch, timeframe);
      setSymbolsData(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to fetch data. Please check your connection or try again later.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedSymbols = await mockFetchFuturesSymbols();
        setSymbols(fetchedSymbols);
        await fetchData(fetchedSymbols);

        if (fetchIntervalRef.current) {
          clearInterval(fetchIntervalRef.current);
        }
        fetchIntervalRef.current = window.setInterval(() => fetchData(fetchedSymbols), 60000);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
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

          {/* Search Input */}
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
          <p>Data provided by Binance Futures API (mocked for this environment).</p>
        </footer>
      </div>
    </div>
  );
};


// --- SiteADataLoader (renamed CryptoPricesTable) Component ---
const CryptoPricesTable = () => {
  const [symbols] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);

  // Function to process a single symbol's data
  const processSymbolData = async (symbol: string): Promise<SignalData | null> => {
    try {
      const candles = await mockFetchCandleData(symbol);
      const closes = candles.map(c => c.close);
      const rsi14 = calculateRSI(closes, 14);
      
      if (candles.length < 2) return null;

      const latestCandle = candles[candles.length - 1];
      const previousCandle = candles[candles.length - 2];
      
      const priceChangePercent = ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100;

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
        previousCandle.volume > candles[candles.length - 3].volume
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
      };
    } catch (error) {
      console.error(`Error processing data for ${symbol}:`, error);
      return null;
    }
  };

  // Mock function to replace the original fetchCandleData from SiteADataLoader
  async function mockFetchCandleData(symbol: string): Promise<Candle[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockCandles: Candle[] = [];
    let currentPrice = 100 + Math.random() * 50;
    for (let i = 0; i < 100; i++) {
      const open = currentPrice;
      const high = open + Math.random() * 5;
      const low = open - Math.random() * 5;
      const close = low + Math.random() * (high - low);
      const volume = 1000 + Math.random() * 5000;
      
      mockCandles.push({
        timestamp: Date.now() - (100 - i) * 60000,
        open,
        high,
        low,
        close,
        volume,
        openTime: Date.now() - (100 - i) * 60000,
      });
      currentPrice = close;
    }
    return mockCandles;
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const processedSignals = await Promise.all(symbols.map(processSymbolData));
      const filteredSignals = processedSignals.filter((s): s is SignalData => s !== null);
      setSignals(filteredSignals);
      setLoading(false);
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [symbols]);

  const signalTable = useMemo(() => {
    return signals.map(s => {
      const currentPrice = s.closes[s.closes.length - 1]?.toFixed(2) || 'N/A';
      
      const pumpDump = {
        pumpStrength: s.closes[s.closes.length - 1] > s.closes[s.closes.length - 10]
          ? (s.closes[s.closes.length - 1] / s.closes[s.closes.length - 10]) * 100
          : 0,
      };

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
        </tr>
      );
    });
  }, [signals]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
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
    </div>
  );
};

// --- Main App Component that exports everything ---
export default function App() {
  return (
    <div className="bg-gray-900 min-h-screen font-sans">
      <header className="py-8 text-center bg-gray-800 text-white">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 mb-2">
          Master Crypto Dashboard
        </h1>
        <p className="text-gray-400">A unified view of crypto market signals and price data.</p>
      </header>
      <div className="container mx-auto p-4">
        <CryptoPricesTable />
        <div className="mt-8">
          <FlagSignalsDashboard />
        </div>
      </div>
    </div>
  );
}
