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
    breakout: 'bullish' | 'bearish' | null;
    isDojiAfterBreakout: boolean;
  };
}

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

const calculateMetrics = (candles: Candle[], timeframe: string): Metrics |
null => {
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
    breakout: null as 'bullish' | 'bearish' |
null,
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
    rsi: rsi!, // Non-null assertion, as we check for length
    mainTrend,
  };
};

// Function to fetch all perpetual USDT symbols
interface BinanceSymbol {
  symbol: string;
  contractType: string;
  quoteAsset: string;
}

const fetchFuturesSymbols = async (): Promise<string[]> => {
  const res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const data: { symbols: BinanceSymbol[] } = await res.json();

  return data.symbols
    .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
    .map((s) => s.symbol);
};

/**
 * Fetch funding rates for a chunk of symbols.
 * Returns an object mapping symbol -> number (fundingRate)
 * If a symbol is missing in the response or cannot be parsed, it will not be set in the returned object.
 */
const fetchFundingRates = async (symbols: string[]) => {
  const fundingData: Record<string, number> = {};
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
      const json = await res.json();
      // Debug log of raw response
      console.debug('Funding raw response for', symbol, json);
      if (json && Array.isArray(json) && json[0] && typeof json[0].fundingRate === 'string') {
        fundingData[symbol] = parseFloat(json[0].fundingRate);
      } else {
        console.warn('Unexpected funding payload for', symbol, json);
      }
    } catch (err) {
      console.error(`Funding fetch error for ${symbol}`, err);
    }
  }));
  return fundingData;
};

interface CombinedSignal {
    symbol: string;
    type: 'bullish' | 'bearish' | null;
    funding: 'positive' | 'negative' | null;
}

// Main component starts here
const FlagSignalsDashboard: React.FC = () => {
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolsData, setSymbolsData] = useState<Record<string, { candles: Candle[], metrics: Metrics | null }>>({});
  // fundingRates holds numeric values; if a symbol is missing, it won't be present as a key
  const [fundingRates, setFundingRates] = useState<Record<string, number>>({});
  // track timestamp (ms) when a funding rate for a symbol was last updated
  const [fundingTimestamps, setFundingTimestamps] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('15m');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const fetchIntervalRef = useRef<number | null>(null);
  // This function fetches the candle data for the given symbols
  const fetchData = async (symbolsToFetch: string[]) => {
    try {
      setErrorMessage(null);
      const newSymbolsData: Record<string, { candles: Candle[], metrics: Metrics | null }> = {};
      const nowMillis = Date.now();
      const tfMillis = getMillis(timeframe);
      const startTime = nowMillis - (100 * tfMillis);
      const fetchPromises = symbolsToFetch.map(async (symbol) => {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=100&startTime=${startTime}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && Array.isArray(data) && data.length > 0) {
          const candles = data.map((d: any[]) => ({
            openTime: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
          }));
          return { symbol, data: { candles, metrics: calculateMetrics(candles, timeframe) } };
        } else {
          console.error(`Failed to fetch data for ${symbol}. Data:`, data);
          return null;
        }
      });
      const results = await Promise.all(fetchPromises);

      results.forEach(result => {
        if (result) {
          newSymbolsData[result.symbol] = result.data;
        }
      });
      setSymbolsData(prevData => ({ ...prevData, ...newSymbolsData }));
      
      // fetch funding for this batch and merge (we will also have a separate dedicated refresh)
      const newFundingRates = await fetchFundingRates(symbolsToFetch);
      // Build timestamps for those that succeeded
      const now = Date.now();
      setFundingRates(prevRates => ({ ...prevRates, ...newFundingRates }));
      setFundingTimestamps(prev => {
        const copy = { ...prev };
        Object.keys(newFundingRates).forEach(sym => {
          copy[sym] = now;
        });
        return copy;
      });

      setLoading(false);
      setLastUpdated(Date.now());
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to fetch data. Please check your connection or try again later.');
      setLoading(false);
    }
  };
  // Background refresh strategy for candles (unchanged logic, but funding has its own refresh below)
  useEffect(() => {
    let isMounted = true;
    const BATCH_SIZE = 10;
    const INTERVAL_MS = 1000; // Base interval between batches
    let currentIndex = 0;
    let symbolsToLoad: string[] = [];

    const loadBatch = async () => {
      if (!symbolsToLoad.length || !isMounted) return;
      const batch = symbolsToLoad.slice(currentIndex, currentIndex + BATCH_SIZE);
      await fetchData(batch);
      currentIndex += BATCH_SIZE;

      if (currentIndex < symbolsToLoad.length && isMounted) {
        setTimeout(loadBatch, INTERVAL_MS);
      } else {
        // Once all symbols are loaded, set up a full refresh interval
        if (isMounted) {
          if (fetchIntervalRef.current) {
            clearInterval(fetchIntervalRef.current);
          }
          fetchIntervalRef.current = window.setInterval(() => fetchData(symbolsToLoad), 60000);
        }
      }
    };

    const initialize = async () => {
      setLoading(true);
      const fetchedSymbols = await fetchFuturesSymbols();
      setAllSymbols(fetchedSymbols); // Store all symbols for later
      symbolsToLoad = fetchedSymbols;
      // Load a small initial batch to display something quickly
      const initialBatch = symbolsToLoad.slice(0, 30);
      setSymbols(initialBatch);
      await fetchData(initialBatch);

      // Start the background refresh for the rest of the symbols
      if (symbolsToLoad.length > 30) {
        currentIndex = 30;
        loadBatch();
      }
    };

    initialize();

    // Cleanup function for the interval
    return () => {
      isMounted = false;
      if (fetchIntervalRef.current) {
        window.clearInterval(fetchIntervalRef.current);
      }
    };
  }, [timeframe]);

  // DEDICATED funding refresh - refresh funding independently every minute
  useEffect(() => {
    if (!allSymbols || allSymbols.length === 0) return;
    let mounted = true;

    const refreshFunding = async () => {
      try {
        // chunk requests to avoid too many parallel requests
        const BATCH = 50;
        for (let i = 0; i < allSymbols.length; i += BATCH) {
          const chunk = allSymbols.slice(i, i + BATCH);
          const rates = await fetchFundingRates(chunk);
          if (!mounted) return;
          const now = Date.now();
          // Merge the results and update timestamps for those returned
          setFundingRates(prev => ({ ...prev, ...rates }));
          setFundingTimestamps(prev => {
            const copy = { ...prev };
            Object.keys(rates).forEach(sym => (copy[sym] = now));
            return copy;
          });
        }
      } catch (err) {
        console.error('Funding refresh error', err);
      }
    };

    // initial immediate refresh then interval
    refreshFunding();
    const iv = window.setInterval(refreshFunding, 60_000);
    return () => { mounted = false; clearInterval(iv); };
  }, [allSymbols]);

  const flaggedSymbolsWithFunding = useMemo(() => {
    return Object.entries(symbolsData).map(([symbol, { metrics }]) => {
      if (!metrics) return null;

      const { ema5, ema10, ema20, ema50, rsi } = metrics;
      const isBull = ema5 > ema10 && ema10 > ema20 && ema20 > ema50 && rsi > 50;
      const isBear = ema5 < ema10 && ema10 < ema20 && ema20 < ema50 && rsi < 50;

      // Use hasOwnProperty to detect whether we actually have a funding rate for this symbol.
      const fundingRate = Object.prototype.hasOwnProperty.call(fundingRates, symbol) ? fundingRates[symbol] : null;

      let fundingBias: 'positive' | 'negative' | null = null;
      if (fundingRate !== null && typeof fundingRate === 'number') {
        if (fundingRate > 0) fundingBias = 'positive';
        else if (fundingRate < 0) fundingBias = 'negative';
      }

      return {
        symbol,
        type: isBull ? 'bullish' : isBear ? 'bearish' : null,
        funding: fundingBias,
      } as CombinedSignal;
    }).filter(Boolean) as CombinedSignal[];
  }, [symbolsData, fundingRates]);

  const bullishBreakoutSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol]?.metrics;
      return s && s.mainTrend && s.mainTrend.breakout === 'bullish';
    });
  }, [symbolsData]);
  const bearishBreakoutSymbols = useMemo(() => {
    return Object.keys(symbolsData).filter(symbol => {
      const s = symbolsData[symbol]?.metrics;
      return s && s.mainTrend && s.mainTrend.breakout === 'bearish';
    });
  }, [symbolsData]);
  // Helper function to filter the symbol lists based on the search term
  const filterSymbols = (symbols: string[]) => {
    return symbols.filter(symbol =>
      symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };
  
  // New filter function for combined signals
  const filterCombinedSignals = (signals: CombinedSignal[]) => {
    return signals.filter(signal =>
      signal.symbol.toLowerCase().includes(searchTerm.toLowerCase())
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
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6"
fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

  const TWO_MIN_MS = 2 * 60 * 1000;
  const renderCombinedSignalsList = (title: string, data: CombinedSignal[]) => (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-xl flex-1 min-w-[300px] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold">{title} ({data.length})</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => copyToClipboard(data.map((item: any) => item.symbol).join(', '))}
            className="text-gray-400 hover:text-white transition-colors duration-200"
            title="Copy symbols"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v4.586a1 1 0 00.293.707l2.121 2.121a1 1 0 001.414 0l2.121-2.121a1 1 0 00.293-.707V7m-6 0h6m-6 0H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2m-8 0V4a2 2 0 012-2h2a2 2 0 012 2v3m-6 0h6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="overflow-y-auto max-h-[300px] space-y-2">
        {data.length > 0 ? (
          data.map((item: any) => {
            const fundingKnown = Object.prototype.hasOwnProperty.call(fundingRates, item.symbol);
            const fundingValue = fundingKnown ? fundingRates[item.symbol] : null;
            const ts = fundingTimestamps[item.symbol] ?? 0;
            const age = ts ? Date.now() - ts : Infinity;
            const isStale = ts === 0 || age > TWO_MIN_MS;

            // color mapping (kept from original but will be accurate with fundingBias)
            const bgClass =
              item.type === 'bullish' && item.funding === 'negative' ? 'bg-green-600' :
              item.type === 'bullish' && item.funding === 'positive' ? 'bg-yellow-600' :
              item.type === 'bearish' && item.funding === 'positive' ? 'bg-red-600' :
              item.type === 'bearish' && item.funding === 'negative' ? 'bg-teal-600' : '';

            return (
              <div
                key={item.symbol}
                className={`relative px-4 py-2 rounded-lg text-lg font-medium text-white ${bgClass}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{item.symbol}</div>
                    <div className="text-sm text-gray-200 mt-1">
                      {item.funding === 'positive' ? '(Funding +)' : item.funding === 'negative' ? '(Funding -)' : '(Funding n/a)'}
                      {fundingKnown && fundingValue !== null ? (
                        <span className="ml-2 text-xs text-gray-300">{Number(fundingValue).toFixed(6)}</span>
                      ) : (
                        <span className="ml-2 text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Stale badge */}
                    {!fundingKnown ? (
                      <span className="text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded">n/a</span>
                    ) : isStale ? (
                      <span className="text-xs bg-yellow-700 text-white px-2 py-1 rounded">stale</span>
                    ) : (
                      <span className="text-xs bg-green-700 text-white px-2 py-1 rounded">fresh</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-gray-500">No symbols found.</p>
        )}
      </div>
    </div>
  );

  const strongBullSignals = useMemo(() => flaggedSymbolsWithFunding.filter((s: CombinedSignal) => s.type === 'bullish' && s.funding === 'negative'), [flaggedSymbolsWithFunding]);
  const weakBullSignals = useMemo(() => flaggedSymbolsWithFunding.filter((s: CombinedSignal) => s.type === 'bullish' && s.funding === 'positive'), [flaggedSymbolsWithFunding]);
  const strongBearSignals = useMemo(() => flaggedSymbolsWithFunding.filter((s: CombinedSignal) => s.type === 'bearish' && s.funding === 'positive'), [flaggedSymbolsWithFunding]);
  const weakBearSignals = useMemo(() => flaggedSymbolsWithFunding.filter((s: CombinedSignal) => s.type === 'bearish' && s.funding === 'negative'), [flaggedSymbolsWithFunding]);

  // Debug function to inspect fundingRates & flaggedSymbolsWithFunding quickly
  const handleDebugConsole = () => {
    console.table(fundingRates);
    console.table(flaggedSymbolsWithFunding);
    // also print timestamps for quick inspection
    console.table(fundingTimestamps);
  };

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
          <p className="text-gray-500 text-sm mt-2">
            Last updated: {new Date(lastUpdated).toLocaleTimeString()}
          </p>
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

          {/* Debug button */}
          <div className="ml-2">
            <button
              onClick={handleDebugConsole}
              className="bg-gray-800 text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-700 transition"
              title="Dump fundingRates & flaggedSymbolsWithFunding to console"
            >
              Debug funding (console)
            </button>
          </div>
        </div>

        {/* === GUIDE + SIGNALS === */}
        <div className="border border-gray-700 bg-gray-800 p-4 rounded mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">📘 Flag + Funding Interpretation Guide</h2>
              <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-gray-400">
                  <tr>
                    <th className="py-1 pr-4">Flag Type</th>
                    <th className="py-1 pr-4">Funding Bias</th>
                    <th className="py-1 pr-4">Interpretation</th>
                    <th className="py-1">Position</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1 pr-4">Bull Flag</td>
                    <td className="py-1 pr-4">Shorts Paying ➖</td>
                    <td className="py-1">✅ Strong Bull Setup</td>
                    <td className="py-1 text-green-400">Buying</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-4">Bull Flag</td>
                    <td className="py-1 pr-4">Longs Paying ➕</td>
                    <td className="py-1">🚨 Bull Trap Risk</td>
                    <td className="py-1 text-red-400">Selling</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-4">Bear Flag</td>
                    <td className="py-1 pr-4">Longs Paying ➕</td>
                    <td className="py-1">✅ Strong Bear Setup</td>
                    <td className="py-1 text-red-400">Selling</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-4">Bear Flag</td>
                    <td className="py-1 pr-4">Shorts Paying ➖</td>
                    <td className="py-1">⚠️ Bear Trap / Weakness</td>
                    <td className="py-1 text-green-400">Buying</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              {/* Quick stats or mini legend (optional) */}
              <h2 className="text-lg font-semibold text-white mb-2">Legend</h2>
              <div className="flex gap-2 items-center mb-2">
                <div className="w-4 h-4 bg-green-600 rounded" />
                <span className="text-gray-300">Strong Bull / Buying</span>
              </div>
              <div className="flex gap-2 items-center mb-2">
                <div className="w-4 h-4 bg-yellow-600 rounded" />
                <span className="text-gray-300">Bull Trap Risk (Selling pressure)</span>
              </div>
              <div className="flex gap-2 items-center mb-2">
                <div className="w-4 h-4 bg-red-600 rounded" />
                <span className="text-gray-300">Strong Bear / Selling</span>
              </div>
              <div className="flex gap-2 items-center">
                <div className="w-4 h-4 bg-teal-600 rounded" />
                <span className="text-gray-300">Bear Trap / Buying</span>
              </div>
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
              {renderCombinedSignalsList('Buying Positions — Strong Bull Setups', filterCombinedSignals(strongBullSignals as CombinedSignal[]))}
              {renderCombinedSignalsList('Buying Positions — Bear Trap / Weakness', filterCombinedSignals(weakBearSignals as CombinedSignal[]))}

              {/* SELLING GROUP */}
              {renderCombinedSignalsList('Selling Positions — Bull Trap Risk', filterCombinedSignals(weakBullSignals as CombinedSignal[]))}
              {renderCombinedSignalsList('Selling Positions — Strong Bear Setups', filterCombinedSignals(strongBearSignals as CombinedSignal[]))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default FlagSignalsDashboard;
