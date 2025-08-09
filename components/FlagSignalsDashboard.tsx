import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

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
    breakout: 'bullish' | 'bearish' | null;
    isDojiAfterBreakout: boolean;
  };
}

interface FlaggedSymbol {
  symbol: string;
  timeframe: string;
  bullishSignal: boolean;
  bearishSignal: boolean;
  strongBullishSignal: boolean;
  strongBearishSignal: boolean;
  signal: string; // The combined signal text
  fundingBiasText: string; // Text for the funding bias
  fundingBias: 'bullish' | 'bearish'; // New field for the funding bias
  ema5: number;
  ema10: number;
  ema20: number;
  ema50: number;
  rsi: number;
}


const fetchSymbols = async (): Promise<string[]> => {
  try {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    return response.data.symbols
      .filter((s: any) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
      .map((s: any) => s.symbol);
  } catch (error) {
    console.error('Error fetching symbols:', error);
    return [];
  }
};

const fetchKlines = async (symbol: string, timeframe: string): Promise<Candle[]> => {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=100`;
  try {
    const response = await axios.get(url);
    return response.data.map((kline: any) => ({
      openTime: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error);
    return [];
  }
};

// Calculate EMA - A common implementation
const calculateEMA = (data: number[], period: number) => {
  const k = 2 / (period + 1);
  let ema = 0;
  if (data.length > 0) {
    ema = data[0];
  }
  const emas = data.map((price, index) => {
    if (index === 0) return ema;
    ema = price * k + ema * (1 - k);
    return ema;
  });
  return emas[emas.length - 1]; // Return the last EMA value
};

// Calculate RSI
const calculateRSI = (data: number[], period: number) => {
  if (data.length < period + 1) return 0;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  const avgGain = gains / data.length;
  const avgLoss = losses / data.length;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

// New function to render the signals in a list format
const renderCombinedSignalsList = (title: string, signals: FlaggedSymbol[]) => (
  <div>
    <h3 className="text-xl font-bold mb-2 text-teal-400">{title}</h3>
    <div className="bg-gray-800 p-4 rounded-lg h-64 overflow-y-auto custom-scrollbar">
      {signals.length > 0 ? (
        <ul>
          {signals.map(signal => (
            <li key={signal.symbol} className="text-gray-200 text-sm mb-1">
              <span className="font-semibold text-teal-300">{signal.symbol}:</span>{' '}
              {signal.signal} | <span className="text-gray-400 italic">{signal.fundingBiasText}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No signals found.</p>
      )}
    </div>
  </div>
);


// This is the updated component signature
const FlagSignalsDashboard = ({ fundingRates }: { fundingRates: any }) => {
  const [timeframe, setTimeframe] = useState('15m');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [flaggedSymbols, setFlaggedSymbols] = useState<Record<string, FlaggedSymbol>>({});

  useEffect(() => {
    const init = async () => {
      const fetchedSymbols = await fetchSymbols();
      setSymbols(fetchedSymbols);
      await processAllSymbols(fetchedSymbols, timeframe);
      setLoading(false);
    };
    init();
  }, []);

  const processAllSymbols = useCallback(async (symbols: string[], timeframe: string) => {
    setLoading(true);
    setFlaggedSymbols({});
    setErrorMessage('');

    const promises = symbols.map(symbol => processSymbol(symbol, timeframe));
    await Promise.all(promises);
    setLoading(false);
  }, []);

  const processSymbol = useCallback(async (symbol: string, timeframe: string) => {
    try {
      const klines = await fetchKlines(symbol, timeframe);
      if (klines.length < 50) return;

      const closingPrices = klines.map(k => k.close);

      // Technicals
      const ema5 = calculateEMA(closingPrices, 5);
      const ema10 = calculateEMA(closingPrices, 10);
      const ema20 = calculateEMA(closingPrices, 20);
      const ema50 = calculateEMA(closingPrices, 50);
      const rsi = calculateRSI(closingPrices, 14);

      // Signal logic
      const isBullish = ema5 > ema10 && ema10 > ema20 && ema20 > ema50 && rsi > 50;
      const isBearish = ema5 < ema10 && ema10 < ema20 && ema20 < ema50 && rsi < 50;
      const fundingBias = fundingRates[symbol]?.rate < 0 ? 'bearish' : 'bullish';

      // Combined signals
      const isStrongBullish = isBullish && fundingBias === 'bearish';
      const isStrongBearish = isBearish && fundingBias === 'bullish';

      // Update state
      setFlaggedSymbols(prev => {
        const newSymbolData = {
          ...prev[symbol],
          symbol: symbol,
          timeframe: timeframe,
          bullishSignal: isBullish,
          bearishSignal: isBearish,
          fundingBias: fundingBias,
          strongBullishSignal: isStrongBullish,
          strongBearishSignal: isStrongBearish,
          ema5: ema5,
          ema10: ema10,
          ema20: ema20,
          ema50: ema50,
          rsi: rsi
        };
        return { ...prev, [symbol]: newSymbolData };
      });

    } catch (error) {
      console.error(`Failed to process ${symbol}:`, error);
      setErrorMessage(`Failed to fetch data for some symbols.`);
    }
  }, [fundingRates]);


  const combinedSignals = useMemo(() => {
    const symbolData = Object.values(flaggedSymbols);
    return symbolData.map(data => {
      let fundingBiasText = '';
      if (data.fundingBias === 'bearish') {
        fundingBiasText = 'Funding is Negative';
      } else if (data.fundingBias === 'bullish') {
        fundingBiasText = 'Funding is Positive';
      }

      let signalType = '';
      if (data.strongBullishSignal) {
        signalType = 'Strong Bullish';
      } else if (data.strongBearishSignal) {
        signalType = 'Strong Bearish';
      } else if (data.bullishSignal) {
        signalType = 'Bullish';
      } else if (data.bearishSignal) {
        signalType = 'Bearish';
      }

      return {
        ...data,
        signal: signalType,
        fundingBiasText: fundingBiasText,
      };
    });
  }, [flaggedSymbols]);

  const filterCombinedSignals = (signals: FlaggedSymbol[]) => signals.filter(s => !!s.signal).sort((a,b) => a.symbol.localeCompare(b.symbol));

  const strongBullSignals = filterCombinedSignals(Object.values(combinedSignals).filter(s => s.strongBullishSignal));
  const strongBearSignals = filterCombinedSignals(Object.values(combinedSignals).filter(s => s.strongBearishSignal));
  const weakBullSignals = filterCombinedSignals(Object.values(combinedSignals).filter(s => s.bullishSignal && !s.strongBullishSignal));
  const weakBearSignals = filterCombinedSignals(Object.values(combinedSignals).filter(s => s.bearishSignal && !s.strongBearishSignal));


  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans">
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4 text-teal-400">Flag Signals Dashboard</h1>
        <p className="text-gray-400 mb-6">Real-time technical flag signals for perpetual contracts on Binance.</p>

        {/* Timeframe selector */}
        <div className="mb-6 flex items-center space-x-4">
          <span className="text-lg text-gray-300">Timeframe:</span>
          {['15m', '4h', '1d'].map(tf => (
            <button
              key={tf}
              onClick={() => {
                setTimeframe(tf);
                processAllSymbols(symbols, tf);
              }}
              className={`px-4 py-2 rounded-md font-semibold transition-colors duration-200 ${
                timeframe === tf
                  ? 'bg-teal-600 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-bold mb-2 text-gray-100">Legend</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex gap-2 items-center">
              <div className="w-4 h-4 bg-green-500 rounded" />
              <span className="text-gray-300">Strong Bullish / Short Squeeze</span>
            </div>
            <div className="flex gap-2 items-center">
              <div className="w-4 h-4 bg-red-500 rounded" />
              <span className="text-gray-300">Strong Bearish / Long Trap</span>
            </div>
            <div className="flex gap-2 items-center">
              <div className="w-4 h-4 bg-sky-600 rounded" />
              <span className="text-gray-300">Bullish / Trend Continuation</span>
            </div>
            <div className="flex gap-2 items-center">
              <div className="w-4 h-4 bg-teal-600 rounded" />
              <span className="text-gray-300">Bearish / Trend Continuation</span>
            </div>
          </div>
        </div>

        {/* Loading / Error / Signals */}
        <div className="mt-8">
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
              {/* BUYING GROUP */}
              {renderCombinedSignalsList('Strong Bullish - Short Squeeze Potential', strongBullSignals)}
              {renderCombinedSignalsList('Weak Bearish - Bear Trap / Weakness', weakBearSignals)}

              {/* SELLING GROUP */}
              {renderCombinedSignalsList('Strong Bearish - Long Trap Risk', strongBearSignals)}
              {renderCombinedSignalsList('Weak Bullish - Trend Reversal Risk', weakBullSignals)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default FlagSignalsDashboard;
