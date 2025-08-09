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
    default: return 15 * 60 * 60 * 1000;
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
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  volumeConfirmation: 'bullish' | 'bearish' | null;
  adx: number;
  atr: number;
}

type SignalStrength = 'Strong' | 'Medium' | 'Weak' | null;

interface CombinedSignal {
  symbol: string;
  type: 'bullish' | 'bearish' | null;
  strength: SignalStrength;
  higherTimeframeConfirmation: 'bullish' | 'bearish' | 'neutral' | null;
}

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

// Helper function to calculate EMA
const calculateEMA = (candles: Candle[], period: number) => {
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

// New function to calculate MACD
const getMACD = (candles: Candle[]) => {
  const shortPeriod = 12;
  const longPeriod = 26;
  const signalPeriod = 9;

  const shortEMA = calculateEMA(candles, shortPeriod);
  const longEMA = calculateEMA(candles, longPeriod);
  
  if (shortEMA.length < 1 || longEMA.length < 1) {
      return { macdLine: 0, macdSignal: 0, macdHistogram: 0 };
  }

  const macdLine = shortEMA.map((short, i) => short - longEMA[i + longPeriod - shortPeriod]);

  const signalLine = calculateEMA(
      macdLine.slice(-signalPeriod).map(val => ({ close: val } as any)),
      signalPeriod
  );

  const macdHistogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];

  return {
      macdLine: macdLine[macdLine.length - 1],
      macdSignal: signalLine[signalLine.length - 1],
      macdHistogram,
  };
};

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

// New function to calculate ADX
const getADX = (candles: Candle[], period = 14) => {
    if (candles.length <= period) {
        return 0;
    }

    let upMoves: number[] = [];
    let downMoves: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const upMove = candles[i].high - candles[i - 1].high;
        const downMove = candles[i - 1].low - candles[i].low;
        upMoves.push(upMove > 0 && upMove > downMove ? upMove : 0);
        downMoves.push(downMove > 0 && downMove > upMove ? downMove : 0);
    }

    let atrValues: number[] = [];
    let trValues: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const tr1 = candles[i].high - candles[i].low;
        const tr2 = Math.abs(candles[i].high - candles[i - 1].close);
        const tr3 = Math.abs(candles[i].low - candles[i - 1].close);
        trValues.push(Math.max(tr1, tr2, tr3));
    }

    let sumATR = trValues.slice(0, period).reduce((sum, val) => sum + val, 0);
    atrValues.push(sumATR / period);
    for (let i = period; i < trValues.length; i++) {
        const newATR = (atrValues[i - period] * (period - 1) + trValues[i]) / period;
        atrValues.push(newATR);
    }
    
    let sumUp = upMoves.slice(0, period).reduce((sum, val) => sum + val, 0);
    let sumDown = downMoves.slice(0, period).reduce((sum, val) => sum + val, 0);
    
    let plusDIValues: number[] = [];
    let minusDIValues: number[] = [];

    plusDIValues.push((sumUp / atrValues[0]) * 100);
    minusDIValues.push((sumDown / atrValues[0]) * 100);

    for (let i = period; i < upMoves.length; i++) {
        const plusDI = (plusDIValues[i - period] * (period - 1) + upMoves[i]) / atrValues[i];
        const minusDI = (minusDIValues[i - period] * (period - 1) + downMoves[i]) / atrValues[i];
        plusDIValues.push((plusDI * 100));
        minusDIValues.push((minusDI * 100));
    }
    
    let dxValues: number[] = [];
    for (let i = 0; i < plusDIValues.length; i++) {
        const sumDI = plusDIValues[i] + minusDIValues[i];
        const dx = sumDI === 0 ? 0 : (Math.abs(plusDIValues[i] - minusDIValues[i]) / sumDI) * 100;
        dxValues.push(dx);
    }

    if (dxValues.length === 0) return 0;
    
    let sumADX = dxValues.slice(0, period).reduce((sum, val) => sum + val, 0);
    let adxValue = sumADX / period;
    
    for (let i = period; i < dxValues.length; i++) {
        adxValue = (adxValue * (period - 1) + dxValues[i]) / period;
    }

    return adxValue;
};

// New function to calculate ATR
const getATR = (candles: Candle[], period = 14) => {
  if (candles.length <= period) {
    return 0;
  }
  let trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
      const tr1 = candles[i].high - candles[i].low;
      const tr2 = Math.abs(candles[i].high - candles[i - 1].close);
      const tr3 = Math.abs(candles[i].low - candles[i - 1].close);
      trValues.push(Math.max(tr1, tr2, tr3));
  }
  let sumATR = trValues.slice(0, period).reduce((sum, val) => sum + val, 0);
  let atr = sumATR / period;
  for (let i = period; i < trValues.length; i++) {
      atr = (atr * (period - 1) + trValues[i]) / period;
  }
  return atr;
};


const calculateMetrics = (candles: Candle[], timeframe: string): Metrics | null => {
  if (!candles || candles.length < 50) return null;
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

  const ema5 = calculateEMA(candles, 5);
  const ema10 = calculateEMA(candles, 10);
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const lastEma5 = ema5[ema5.length - 1];
  const lastEma10 = ema10[ema10.length - 1];
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];

  const rsi = getRSI(candles, 14);
  const { macdLine, macdSignal, macdHistogram } = getMACD(candles);

  const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
  let volumeConfirmation: 'bullish' | 'bearish' | null = null;
  if (lastCandle.volume > avgVolume) {
      if (lastCandle.close > lastCandle.open) {
          volumeConfirmation = 'bullish';
      } else if (lastCandle.close < lastCandle.open) {
          volumeConfirmation = 'bearish';
      }
  }

  const adx = getADX(candles, 14);
  const atr = getATR(candles, 14);

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
    macdLine,
    macdSignal,
    macdHistogram,
    volumeConfirmation,
    adx,
    atr,
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

// Backtesting functionality
type BacktestResult = 'TP Hit' | 'SL Hit' | 'No Result';

const runBacktest = (
  candles: Candle[],
  signalType: 'bullish' | 'bearish',
  entryPrice: number,
  tp: number,
  sl: number,
  signalTimestamp: number,
  timeframe: string
): BacktestResult => {
  const signalIndex = candles.findIndex(c => c.openTime === signalTimestamp);
  if (signalIndex === -1) return 'No Result';

  // Backtest from the candle after the signal candle
  const startIndex = signalIndex + 1;

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];
    const high = candle.high;
    const low = candle.low;

    if (signalType === 'bullish') {
      const tpPrice = entryPrice * (1 + tp);
      const slPrice = entryPrice * (1 - sl);

      if (high >= tpPrice) {
        return 'TP Hit';
      }
      if (low <= slPrice) {
        return 'SL Hit';
      }
    } else if (signalType === 'bearish') {
      const tpPrice = entryPrice * (1 - tp);
      const slPrice = entryPrice * (1 + sl);

      if (low <= tpPrice) {
        return 'TP Hit';
      }
      if (high >= slPrice) {
        return 'SL Hit';
      }
    }
  }

  return 'No Result';
};

const checkSignal = (metrics: Metrics, higherTimeframeConfirmation: 'bullish' | 'bearish' | 'neutral' | null): { type: 'bullish' | 'bearish' | null, strength: SignalStrength } => {
  const { ema5, ema10, ema20, ema50, rsi, macdLine, macdSignal, mainTrend, volumeConfirmation, adx, atr } = metrics;
  
  const isEmaBullish = ema5 > ema10 && ema10 > ema20 && ema20 > ema50 && rsi > 50;
  const isEmaBearish = ema5 < ema10 && ema10 < ema20 && ema20 < ema50 && rsi < 50;
  
  const macdBullishConfirmation = macdLine > macdSignal;
  const macdBearishConfirmation = macdLine < macdSignal;
  const volumeBullishConfirmation = volumeConfirmation === 'bullish';
  const volumeBearishConfirmation = volumeConfirmation === 'bearish';

  const isStrongTrend = adx > 25;
  const isMediumTrend = adx >= 20 && adx <= 25;
  const isHighVolatility = atr > 0.005;

  let type: 'bullish' | 'bearish' | null = null;
  let strength: SignalStrength = null;

  if (isEmaBullish && mainTrend.breakout === 'bullish' && macdBullishConfirmation && volumeBullishConfirmation && isStrongTrend && isHighVolatility && higherTimeframeConfirmation === 'bullish') {
    type = 'bullish';
    strength = 'Strong';
  } 
  else if (isEmaBearish && mainTrend.breakout === 'bearish' && macdBearishConfirmation && volumeBearishConfirmation && isStrongTrend && isHighVolatility && higherTimeframeConfirmation === 'bearish') {
    type = 'bearish';
    strength = 'Strong';
  }
  else if (isEmaBullish && (mainTrend.breakout === 'bullish' || macdBullishConfirmation) && isMediumTrend && higherTimeframeConfirmation !== 'bearish') {
    type = 'bullish';
    strength = 'Medium';
  }
  else if (isEmaBearish && (mainTrend.breakout === 'bearish' || macdBearishConfirmation) && isMediumTrend && higherTimeframeConfirmation !== 'bullish') {
    type = 'bearish';
    strength = 'Medium';
  }
  else if (isEmaBullish && higherTimeframeConfirmation !== 'bearish') {
    type = 'bullish';
    strength = 'Weak';
  }
  else if (isEmaBearish && higherTimeframeConfirmation !== 'bullish') {
    type = 'bearish';
    strength = 'Weak';
  }
  
  return { type, strength };
};

// Main component starts here
const FlagSignalsDashboard: React.FC = () => {
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [symbolsData, setSymbolsData] = useState<Record<string, { candles: Candle[], metrics: Metrics | null }>>({});
  const [symbolsHigherTimeframeData, setSymbolsHigherTimeframeData] = useState<Record<string, { candles4h: Candle[], candles1d: Candle[] }>>({});
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('15m');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [backtestResults, setBacktestResults] = useState<Record<string, BacktestResult | null>>({});
  const [backtesting, setBacktesting] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const fetchIntervalRef = useRef<number | null>(null);
  const [overallBacktestResult, setOverallBacktestResult] = useState<string | null>(null);
  const [isOverallBacktesting, setIsOverallBacktesting] = useState(false);

  const fetchData = async (symbolsToFetch: string[]) => {
    try {
      setErrorMessage(null);
      const newSymbolsData: Record<string, { candles: Candle[], metrics: Metrics | null }> = {};
      const newSymbolsHigherTimeframeData: Record<string, { candles4h: Candle[], candles1d: Candle[] }> = {};
      const nowMillis = Date.now();
      const tfMillis = getMillis(timeframe);
      const startTime = nowMillis - (500 * tfMillis);
      const fetchPromises = symbolsToFetch.map(async (symbol) => {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=500&startTime=${startTime}`;
        const response = await fetch(url);
        const data = await response.json();

        // Fetch higher timeframe data
        const url4h = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=500`;
        const response4h = await fetch(url4h);
        const data4h = await response4h.json();

        const url1d = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=500`;
        const response1d = await fetch(url1d);
        const data1d = await response1d.json();

        if (data && Array.isArray(data) && data.length > 0) {
          const candles = data.map((d: any[]) => ({
            openTime: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
          }));
          newSymbolsHigherTimeframeData[symbol] = {
            candles4h: data4h.map((d: any[]) => ({
              openTime: d[0],
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5]),
            })),
            candles1d: data1d.map((d: any[]) => ({
              openTime: d[0],
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5]),
            }))
          };
          
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
      setSymbolsHigherTimeframeData(prevData => ({ ...prevData, ...newSymbolsHigherTimeframeData }));
      setLoading(false);
      setLastUpdated(Date.now());
      setCountdown(300); // Reset countdown on successful fetch
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to fetch data. Please check your connection or try again later.');
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const BATCH_SIZE = 10;
    const INTERVAL_MS = 1000;
    let currentIndex = 0;
    let symbolsToLoad: string[] = [];

    const initialize = async () => {
      setLoading(true);
      const fetchedSymbols = await fetchFuturesSymbols();
      setAllSymbols(fetchedSymbols);
      symbolsToLoad = fetchedSymbols;
      const initialBatch = symbolsToLoad.slice(0, 30);
      await fetchData(initialBatch);

      if (symbolsToLoad.length > 30) {
        currentIndex = 30;
        loadBatch();
      }
    };

    const loadBatch = async () => {
      if (!symbolsToLoad.length || !isMounted) return;
      const batch = symbolsToLoad.slice(currentIndex, currentIndex + BATCH_SIZE);
      await fetchData(batch);
      currentIndex += BATCH_SIZE;

      if (currentIndex < symbolsToLoad.length && isMounted) {
        setTimeout(loadBatch, INTERVAL_MS);
      } else {
        if (isMounted) {
          if (fetchIntervalRef.current) {
            clearInterval(fetchIntervalRef.current);
          }
          // The refresh interval has been changed from 60 seconds (60000) to 5 minutes (300000) to avoid rate limits.
          fetchIntervalRef.current = window.setInterval(() => fetchData(symbolsToLoad), 300000);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
      if (fetchIntervalRef.current) {
        window.clearInterval(fetchIntervalRef.current);
      }
    };
  }, [timeframe]);

  // New useEffect for the countdown timer
  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setCountdown((prevCountdown) => (prevCountdown > 0 ? prevCountdown - 1 : 300));
    }, 1000);
    
    return () => clearInterval(countdownInterval);
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const flaggedSignals = useMemo(() => {
    return Object.entries(symbolsData).map(([symbol, { metrics }]) => {
      if (!metrics) return null;
      const higherTimeframeData = symbolsHigherTimeframeData[symbol];
  
      let higherTimeframeConfirmation: 'bullish' | 'bearish' | 'neutral' | null = null;
      if (higherTimeframeData) {
        const metrics4h = calculateMetrics(higherTimeframeData.candles4h, '4h');
        const metrics1d = calculateMetrics(higherTimeframeData.candles1d, '1d');
        
        const isBullish4h = metrics4h && metrics4h.ema5 > metrics4h.ema10 && metrics4h.ema10 > metrics4h.ema20;
        const isBullish1d = metrics1d && metrics1d.ema5 > metrics1d.ema10 && metrics1d.ema10 > metrics1d.ema20;
        const isBearish4h = metrics4h && metrics4h.ema5 < metrics4h.ema10 && metrics4h.ema10 < metrics4h.ema20;
        const isBearish1d = metrics1d && metrics1d.ema5 < metrics1d.ema10 && metrics1d.ema10 < metrics1d.ema20;
  
        if (isBullish4h || isBullish1d) {
          higherTimeframeConfirmation = 'bullish';
        } else if (isBearish4h || isBearish1d) {
          higherTimeframeConfirmation = 'bearish';
        } else {
          higherTimeframeConfirmation = 'neutral';
        }
      }
      
      const { type, strength } = checkSignal(metrics, higherTimeframeConfirmation);
      if (type) {
        return { symbol, type, strength, higherTimeframeConfirmation };
      }
      return null;
    }).filter(Boolean) as CombinedSignal[];
  }, [symbolsData, symbolsHigherTimeframeData]);

  const bullishSignals = useMemo(() => flaggedSignals.filter((s: CombinedSignal) => s.type === 'bullish'), [flaggedSignals]);
  const bearishSignals = useMemo(() => flaggedSignals.filter((s: CombinedSignal) => s.type === 'bearish'), [flaggedSignals]);
  
  const filterCombinedSignals = (signals: CombinedSignal[]) => {
    return signals.filter(signal =>
      signal.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const handleBacktest = async (symbol: string, signalType: 'bullish' | 'bearish') => {
    setBacktesting(true);
    setBacktestResults(prev => ({ ...prev, [symbol]: null }));
    const candles = symbolsData[symbol]?.candles;
    const higherTfCandles = symbolsHigherTimeframeData[symbol];
    if (!candles || !higherTfCandles) {
      setBacktestResults(prev => ({ ...prev, [symbol]: 'No Result' }));
      setBacktesting(false);
      return;
    }
    
    // Find the last candle that would have generated the signal
    let signalCandleIndex = -1;
    // Iterate from an earlier point to find a historical signal. Start from second to last candle.
    for (let i = candles.length - 2; i >= 50; i--) { 
      const subCandles = candles.slice(0, i + 1);
      const subHigherTfCandles = {
        candles4h: higherTfCandles.candles4h.slice(0, i + 1),
        candles1d: higherTfCandles.candles1d.slice(0, i + 1)
      };

      const subMetrics = calculateMetrics(subCandles, timeframe);
      if (subMetrics) {
        const metrics4h = calculateMetrics(subHigherTfCandles.candles4h, '4h');
        const metrics1d = calculateMetrics(subHigherTfCandles.candles1d, '1d');

        const isBullish4h = metrics4h && metrics4h.ema5 > metrics4h.ema10 && metrics4h.ema10 > metrics4h.ema20;
        const isBullish1d = metrics1d && metrics1d.ema5 > metrics1d.ema10 && metrics1d.ema10 > metrics1d.ema20;
        const isBearish4h = metrics4h && metrics4h.ema5 < metrics4h.ema10 && metrics4h.ema10 < metrics4h.ema20;
        const isBearish1d = metrics1d && metrics1d.ema5 < metrics1d.ema10 && metrics1d.ema10 < metrics1d.ema20;
  
        let higherTimeframeConfirmation: 'bullish' | 'bearish' | 'neutral' | null = null;
        if (isBullish4h || isBullish1d) {
          higherTimeframeConfirmation = 'bullish';
        } else if (isBearish4h || isBearish1d) {
          higherTimeframeConfirmation = 'bearish';
        } else {
          higherTimeframeConfirmation = 'neutral';
        }

        const { type } = checkSignal(subMetrics, higherTimeframeConfirmation);

        if (type === signalType) {
          signalCandleIndex = i;
          break;
        }
      }
    }

    if (signalCandleIndex === -1) {
      setBacktestResults(prev => ({ ...prev, [symbol]: 'No Result' }));
      setBacktesting(false);
      return;
    }
    
    const entryPrice = candles[signalCandleIndex].close;
    const tpPercentage = 0.005; // 0.5%
    const slPercentage = 0.005; // -0.5%

    const result = runBacktest(
      candles,
      signalType,
      entryPrice,
      tpPercentage,
      slPercentage,
      candles[signalCandleIndex].openTime,
      timeframe
    );
    
    setBacktestResults(prev => ({ ...prev, [symbol]: result }));
    setBacktesting(false);
  };
  
  const handleOverallBacktest = async () => {
    setIsOverallBacktesting(true);
    setOverallBacktestResult(null);
    let tpHits = 0;
    let slHits = 0;
    let totalSignals = 0;

    for (const signal of flaggedSignals) {
      const candles = symbolsData[signal.symbol]?.candles;
      const higherTfCandles = symbolsHigherTimeframeData[signal.symbol];
      if (!candles || !higherTfCandles) {
        continue;
      }
      
      let signalCandleIndex = -1;
      for (let i = candles.length - 2; i >= 50; i--) { 
        const subCandles = candles.slice(0, i + 1);
        const subHigherTfCandles = {
          candles4h: higherTfCandles.candles4h.slice(0, i + 1),
          candles1d: higherTfCandles.candles1d.slice(0, i + 1)
        };

        const subMetrics = calculateMetrics(subCandles, timeframe);
        if (subMetrics) {
          const metrics4h = calculateMetrics(subHigherTfCandles.candles4h, '4h');
          const metrics1d = calculateMetrics(subHigherTfCandles.candles1d, '1d');

          const isBullish4h = metrics4h && metrics4h.ema5 > metrics4h.ema10 && metrics4h.ema10 > metrics4h.ema20;
          const isBullish1d = metrics1d && metrics1d.ema5 > metrics1d.ema10 && metrics1d.ema10 > metrics1d.ema20;
          const isBearish4h = metrics4h && metrics4h.ema5 < metrics4h.ema10 && metrics4h.ema10 < metrics4h.ema20;
          const isBearish1d = metrics1d && metrics1d.ema5 < metrics1d.ema10 && metrics1d.ema10 < metrics1d.ema20;
    
          let higherTimeframeConfirmation: 'bullish' | 'bearish' | 'neutral' | null = null;
          if (isBullish4h || isBullish1d) {
            higherTimeframeConfirmation = 'bullish';
          } else if (isBearish4h || isBearish1d) {
            higherTimeframeConfirmation = 'bearish';
          } else {
            higherTimeframeConfirmation = 'neutral';
          }

          const { type } = checkSignal(subMetrics, higherTimeframeConfirmation);

          if (type === signal.type) {
            signalCandleIndex = i;
            break;
          }
        }
      }

      if (signalCandleIndex !== -1) {
        totalSignals++;
        const entryPrice = candles[signalCandleIndex].close;
        const tpPercentage = 0.005;
        const slPercentage = 0.005;

        const result = runBacktest(
          candles,
          signal.type,
          entryPrice,
          tpPercentage,
          slPercentage,
          candles[signalCandleIndex].openTime,
          timeframe
        );

        if (result === 'TP Hit') {
          tpHits++;
        } else if (result === 'SL Hit') {
          slHits++;
        }
      }
    }
    
    const winRate = totalSignals > 0 ? (tpHits / (tpHits + slHits)) * 100 : 0;
    const finalResult = `Overall Backtest Result (0.5% TP vs 0.5% SL): ${winRate.toFixed(2)}% TP Hit Rate from ${tpHits + slHits} signals tested.`;
    setOverallBacktestResult(finalResult);
    setIsOverallBacktesting(false);
  };


  const renderCombinedSignalsList = (title: string, data: CombinedSignal[]) => {
    const strengthOrder: { [key: string]: number } = { 'Strong': 3, 'Medium': 2, 'Weak': 1 };
    
    const sortedData = [...data].sort((a, b) => {
      const aStrength = strengthOrder[a.strength || 'Weak'] || 0;
      const bStrength = strengthOrder[b.strength || 'Weak'] || 0;
      
      if (sortOrder === 'desc') {
        return bStrength - aStrength;
      } else {
        return aStrength - bStrength;
      }
    });

    return (
      <div className="bg-gray-800 p-6 rounded-2xl shadow-xl flex-1 min-w-[300px] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold">{title} ({data.length})</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="text-gray-400 hover:text-white transition-colors duration-200"
              title={`Sort by strength (${sortOrder === 'desc' ? 'Descending' : 'Ascending'})`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform ${sortOrder === 'desc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M3 8h18m-6 4h6m-6 4h6m-12 4h12" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 13l-3 3m0 0l-3-3m3 3V3" />
              </svg>
            </button>
            <button
              onClick={() => copyToClipboard(data.map((item: any) => item.symbol).join(', '))}
              className="text-gray-400 hover:text-white transition-colors 
duration-200"
              title="Copy symbols"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v4.586a1 1 0 00.293.707l2.121 2.121a1 1 0 001.414 0l2.121-2.121a1 1 0 00.293-.707V7m-6 0h6m-6 0H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2m-8 0V4a2 2 0 012-2h2a2 2 0 012 2v3m-6 0h6" 
/>
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[300px] space-y-2">
          {sortedData.length > 0 ? (
            sortedData.map((item: any) => {
              const getStrengthColor = (strength: SignalStrength) => {
                switch (strength) {
                  case 'Strong': return 'text-yellow-400';
                  case 'Medium': return 'text-teal-400';
                  case 'Weak': return 'text-gray-400';
                  default: return '';
                }
              };

              const getBacktestResultColor = (result: BacktestResult) => {
                switch (result) {
                  case 'TP Hit': return 'bg-green-500';
                  case 'SL Hit': return 'bg-red-500';
                  case 'No Result': return 'bg-gray-500';
                  default: return '';
                }
              }

              const bgClass =
                item.type === 'bullish' ? 'bg-green-600' :
                item.type === 'bearish' ? 'bg-red-600' : '';
                
              const backtestResult = backtestResults[item.symbol];

              return (
                <div
                  key={item.symbol}
                  className={`relative px-4 py-2 rounded-lg text-lg font-medium text-white ${bgClass}`}
                >
                  <div className="flex items-center justify-between">
              
                    <div>
                      <div className="font-semibold">{item.symbol}</div>
                      <div className="text-sm text-gray-200">
                        Higher TF: {item.higherTimeframeConfirmation}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${getStrengthColor(item.strength)}`}>
                        {item.strength}
                      </span>
                      <button
                        onClick={() => handleBacktest(item.symbol, item.type)}
                        className={`px-3 py-1 rounded-lg text-sm text-white ${backtesting && backtestResults[item.symbol] === undefined ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
                        disabled={backtesting && backtestResults[item.symbol] === undefined}
                      >
                        {backtesting && backtestResults[item.symbol] === undefined ? 'Testing...' : 'Test'}
                      </button>
                      {backtestResult && (
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getBacktestResultColor(backtestResult)}`}>
                          {backtestResult}
                        </span>
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
  };

  const handleDebugConsole = () => {
    console.table(flaggedSignals);
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
            Last updated: {new Date(lastUpdated).toLocaleTimeString()} | Next refresh in: {formatTime(countdown)}
          </p>
          {overallBacktestResult && (
            <div className="mt-4 p-4 rounded-lg bg-green-900 text-green-200">
              <p className="font-semibold">{overallBacktestResult}</p>
            </div>
          )}
        </header>

        <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-8">
      
          <div className="flex space-x-2 bg-gray-800 p-2 rounded-xl shadow-inner">
            <button
              onClick={() => setTimeframe('15m')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeframe === '15m' ?
'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
            >
              15m
            </button>
            <button
              onClick={() => setTimeframe('4h')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeframe === '4h' ?
'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
            >
              4h
            </button>
            <button
              onClick={() => setTimeframe('1d')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeframe === '1d' ?
'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
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

          {/* Debug and Overall Backtest buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleOverallBacktest}
              className={`bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${isOverallBacktesting ? 'bg-blue-800 cursor-not-allowed' : 'hover:bg-blue-500'}`}
              disabled={isOverallBacktesting}
            >
              {isOverallBacktesting ? 'Backtesting...' : 'Run Overall Backtest'}
            </button>
            <button
              onClick={handleDebugConsole}
              className="bg-gray-800 text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-700 transition"
              title="Dump flaggedSignals to console"
            >
              Debug (console)
         
            </button>
          </div>
        </div>

        {/* Loading / Error / Signals */}
        <div className="mt-8">
          {loading ?
(
            <div className="flex justify-center items-center h-[50vh]">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-teal-500"></div>
            </div>
          ) : errorMessage ?
(
            <div className="bg-red-900 border-l-4 border-red-500 text-red-200 p-4 rounded-lg">
              <p>{errorMessage}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {renderCombinedSignalsList('Bullish Signals', filterCombinedSignals(bullishSignals))}
              {renderCombinedSignalsList('Bearish Signals', filterCombinedSignals(bearishSignals))}
            </div>
  
          )}
        </div>

      </div>
    </div>
  );
};

export default FlagSignalsDashboard;
