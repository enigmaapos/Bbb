import React, { useState, useEffect, useMemo, useRef } from 'react';

// A utility function to copy text to the clipboard.
// This is a browser-safe implementation for a sandboxed environment.
const copyToClipboard = (text) => {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
};

// Helper function to convert a timeframe string to milliseconds.
const getMillis = (timeframe) => {
  switch (timeframe) {
    case '15m': return 15 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
};

// Calculates the start timestamps for the current and previous trading sessions
// based on the selected timeframe.
const getSessions = (timeframe, nowMillis) => {
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

// Determines if a candle is a "doji" based on body size relative to total range.
const isDoji = (candle) => {
  const bodySize = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;
  return totalRange > 0 && (bodySize / totalRange) < 0.2;
};

// Determines if a candle is bullish.
const isBullish = (candle) => candle.close > candle.open;

// Determines if a candle is bearish.
const isBearish = (candle) => candle.close < candle.open;

// Calculates various technical metrics (EMAs, RSI, breakouts) from candle data.
const calculateMetrics = (candles, timeframe) => {
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
  const lastCandleIndex = candles.findIndex(c => c.openTime === lastCandle.openTime);
  const prevLastCandle = candles[lastCandleIndex - 1];

  const mainTrend = {
    breakout: null,
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

  // Calculates Exponential Moving Average (EMA)
  const ema = (candles, period) => {
    if (candles.length < period) return [];
    const alpha = 2 / (period + 1);
    const emaValues = [candles[0].close];
    for (let i = 1; i < candles.length; i++) {
      const prevEma = emaValues[i - 1];
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

  // Calculates Relative Strength Index (RSI)
  const getRSI = (candles, period = 14) => {
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
    rsi,
    mainTrend,
  };
};

// Main component for the Crypto Signals Dashboard
const CryptoSignalsDashboard = () => {
  // State to hold the fetched data and UI status
  const [symbolsData, setSymbolsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('15m');
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Refs for managing intervals and timeouts
  const fetchIntervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // List of cryptocurrency symbols to track
  const symbols = useMemo(() => [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', '1000SHIBUSDT', 'DOTUSDT', 'LINKUSDT',
    'AVAXUSDT', 'TRXUSDT', 'POLYXUSDT', 'BCHUSDT', 'LTCUSDT', 'UNIUSDT', 'ICPUSDT', 'ETCUSDT', 'APTUSDT', 'XLMUSDT'
  ], []);

  // Function to fetch data from the Binance Futures API
  const fetchData = async () => {
    try {
      setErrorMessage(null);
      const newSymbolsData = {};
      const nowMillis = Date.now();
      const tfMillis = getMillis(timeframe);
      const startTime = nowMillis - (100 * tfMillis);
      
      for (const symbol of symbols) {
        // Fetching data from Binance Futures API for perpetual USDT pairs
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=100&startTime=${startTime}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && Array.isArray(data) && data.length > 0) {
          const candles = data.map(d => ({
            openTime: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
          }));
          newSymbolsData[symbol] = {
            candles,
            metrics: calculateMetrics(candles, timeframe)
          };
        } else {
          console.error(`Failed to fetch data for ${symbol}. Data:`, data);
        }
      }
      setSymbolsData(newSymbolsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to fetch data. Please check your connection or try again later.');
      setLoading(false);
    }
  };

  // useEffect to handle data fetching and refreshing
  useEffect(() => {
    setLoading(true);
    fetchData();
    if (fetchIntervalRef.current) {
      clearInterval(fetchIntervalRef.current);
    }
    fetchIntervalRef.current = setInterval(fetchData, 60000); // Refresh every 60 seconds

    return () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [timeframe]); // Re-run effect when timeframe changes

  // Memoized lists for different signals
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
      // Note: The original code correctly removed the Doji check here.
      return s && s.mainTrend && s.mainTrend.breakout === 'bullish';
    });
  }, [symbolsData]);

  const bearishBreakoutSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol].metrics;
      // Note: The original code correctly removed the Doji check here.
      return s && s.mainTrend && s.mainTrend.breakout === 'bearish';
    });
  }, [symbolsData]);
  
  // Helper component to render a list of symbols
  const renderSymbolsList = (title, symbols, color) => (
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
            Site A DataLoader Dashboard
          </h1>
          <p className="text-gray-400 text-lg">Real-time market analysis for top perpetual USDT pairs on Binance Futures.</p>
        </header>

        <div className="flex justify-center mb-8">
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
            {renderSymbolsList('Bullish Breakouts', bullishBreakoutSymbols, 'bg-green-600 hover:bg-green-500')}
            {renderSymbolsList('Bearish Breakouts', bearishBreakoutSymbols, 'bg-red-600 hover:bg-red-500')}
            {renderSymbolsList('Bull Flags', bullFlagSymbols, 'bg-blue-600 hover:bg-blue-500')}
            {renderSymbolsList('Bear Flags', bearFlagSymbols, 'bg-orange-600 hover:bg-orange-500')}
          </div>
        )}

        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>Data provided by Binance Futures API.</p>
        </footer>
      </div>
    </div>
  );
};

export default CryptoSignalsDashboard;
