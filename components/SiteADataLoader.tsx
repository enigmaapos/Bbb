// SiteADataLoader.ws.tsx
import React, { useEffect, useRef, useState, useMemo } from "react";
/**
 * Reworked SiteADataLoader with:
 * - bulk /fapi/v1/ticker/24hr fetch
 * - batch kline fetch (safe rate)
 * - websocket kline streams grouped per-socket
 * - in-memory incremental updates + recalculation of indicators
 * - throttled UI flush (1s)
 *
 * CONFIGURE near the top for rate-safety / coverage tradeoffs.
 */

/* ----------------------------- CONFIG ------------------------------ */
const TIMEFRAME = "15m"; // default timeframe (supports `15m`, `4h`, `1d` in this code)
const KLINE_LIMIT = 500;
const BATCH_SIZE = 8; // how many symbols to fetch in parallel per REST batch
const BATCH_DELAY_MS = 1200;
// wait between batches (increase if you get REST 429s)
const MAX_STREAM_SYMBOLS = 150;
// how many top-by-volume symbols to stream (reduce to be safer)
const SOCKET_MAX_STREAMS = 200;
// number of streams per websocket connection
const UI_FLUSH_MS = 1000;
// how often to flush in-memory data to React state
const KLINES_API_BASE = "https://fapi.binance.com"; // futures REST base
const WS_BASE = "wss://fstream.binance.com/stream?streams=";
// futures websocket base
/* ------------------------------------------------------------------ */

/* ----------------------------- Types ------------------------------- */
type Candle = {
  timestamp: number;
  // open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type MainTrend = {
  trend: "bullish" | "bearish" | "neutral";
  type: "support" | "resistance" | "none";
  crossoverPrice: number;
  breakout: "bullish" | "bearish" | null;
  isNear: boolean;
  isDojiAfterBreakout: boolean;
};

type SymbolData = {
  symbol: string;
  candles: Candle[];
  // chronological
  rsi14: number[]; // aligned to candles (NaN for initial)
  closes: number[];
  priceChangePercent?: number;
  mainTrend?: MainTrend;
  prevClosedGreen?: boolean | null;
  prevClosedRed?: boolean | null;
  highestVolumeColorPrev?: "green" | "red" | null;
  lastKlineEventTimestamp?: number;
  // used to avoid duplicate processing
};
/* ------------------------------------------------------------------ */

/* ------------------------- Indicator Utils ------------------------- */
/** Simple EMA implementation returning full array (NaN for initial) */
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }
    if (i === period - 1) {
      const sma = data.slice(0, period).reduce((s, x) => s + x, 0) / period;
      prev = sma;
      ema.push(prev);
      continue;
    }
    if (prev !== null) {
      const cur: number = v * k + prev * (1 - k);
      ema.push(cur);
      prev = cur;
    } else {
      ema.push(NaN);
    }
  }
  return ema;
}

/** RSI (Wilder) */
function calculateRSI(closes: number[], period = 14): number[] {
  if (!Array.isArray(closes) || closes.length <= period) {
    return new Array(closes.length).fill(NaN);
  }
  const rsi: number[] = new Array(closes.length).fill(NaN);

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
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
  return rsi;
}
/* ------------------------------------------------------------------ */

/* ------------------------- Helper functions ------------------------ */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchWithRetryJSON(url: string, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const ra = res.headers.get("Retry-After");
        const wait = ra ? parseInt(ra, 10) * 1000 : delay * Math.pow(2, i);
        console.warn(`[fetchWithRetry] 429. Waiting ${wait}ms for ${url}`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (err) {
      console.warn(`[fetchWithRetry] attempt ${i + 1} failed for ${url}`, err);
      if (i === retries - 1) throw err;
      await sleep(delay * Math.pow(2, i));
    }
  }
  return null;
}
/* ------------------------------------------------------------------ */

/* --------------------------- React Component ----------------------- */
export default function SiteADataLoader() {
  const [uiSymbols, setUiSymbols] = useState<SymbolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState(TIMEFRAME);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // ref store for in-memory symbol data (avoids frequent setState)
  const symbolMapRef = useRef<Map<string, SymbolData>>(new Map());
  const socketsRef = useRef<WebSocket[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  /* --------------- Utility: decide session times like your original code if needed --------------- */
  const getSessions = (tf: string) => {
    // The previous implementation had a special daily session;
    // keep same behavior if tf === '1d'
    const now = new Date();
    if (!tf || tf === "1d") {
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
        "15m": 15 * 60 * 1000,
        "4h": 4 * 60 * 60 * 1000,
      };
      const tfMillis = MILLISECONDS[tf] || MILLISECONDS["15m"];
      const sessionStart = Math.floor(nowMillis / tfMillis) * tfMillis;
      const sessionEnd = sessionStart + tfMillis;
      const prevSessionStart = sessionStart - tfMillis;
      const prevSessionEnd = sessionStart;
      return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
    }
  };
  /* ----------------------- Core data initialization ---------------------- */
  useEffect(() => {
    mountedRef.current = true;
    (async function init() {
      setLoading(true);
      symbolMapRef.current.clear();
      setUiSymbols([]);
      setLastUpdated(null);

      try {
        // 1) Fetch exchangeInfo once (we only need symbols)
        const exchangeInfo = await fetchWithRetryJSON(`${KLINES_API_BASE}/fapi/v1/exchangeInfo`);
        if (!exchangeInfo || !Array.isArray(exchangeInfo.symbols)) {
          throw new Error("Failed to load exchangeInfo");
        }

        // 2) Fetch bulk 24hr ticker (single call for all symbols)
        const allTickers = await fetchWithRetryJSON(`${KLINES_API_BASE}/fapi/v1/ticker/24hr`);
        if (!Array.isArray(allTickers)) throw new Error("Failed to load bulk 24hr tickers");
        // Filter eligible symbols (USDT perpetuals), combine ticker info to pick top N by quoteVolume
        const usdtSymbols = exchangeInfo.symbols
          .filter((s: any) => s.symbol.endsWith("USDT") && s.status === "TRADING")
          .map((s: any) => s.symbol);
        // map tickers by symbol for quick lookup
        const tickerMap = new Map<string, any>();
        for (const t of allTickers) tickerMap.set(t.symbol, t);

        // sort by quoteVolume (descending) and pick top MAX_STREAM_SYMBOLS
        const eligibleTickers = Array.from(tickerMap.values())
          .filter((t: any) => usdtSymbols.includes(t.symbol))
          .sort((a: any, b: any) => Number(b.quoteVolume || 0) - Number(a.quoteVolume || 0))
          .slice(0, MAX_STREAM_SYMBOLS);
        const symbolsToLoad = eligibleTickers.map((t: any) => t.symbol);

        // 3) Batch fetch klines for each symbol (limit=KLINE_LIMIT).
        // We'll do small batches with delay
        // We'll only fetch for the selected symbolsToLoad (keeps REST usage low).
        for (let i = 0; i < symbolsToLoad.length; i += BATCH_SIZE) {
          const batch = symbolsToLoad.slice(i, i + BATCH_SIZE);
          // parallelize limited batch
          await Promise.all(
            batch.map(async (symbol) => {
              try {
                const raw = await fetchWithRetryJSON(
                  `${KLINES_API_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${KLINE_LIMIT}`
                );

                if (!Array.isArray(raw)) return;
                const candles = raw.map((c: any[]) => ({
                  timestamp: c[0],
                  open: +c[1],
                  high: +c[2],

                  low: +c[3],
                  close: +c[4],
                  volume: +c[5],
                })) as Candle[];

                const closes = candles.map((c) => c.close);

                const rsi14 = calculateRSI(closes, 14);

                const ticker = tickerMap.get(symbol);
                const priceChangePercent = ticker ? parseFloat(ticker.priceChangePercent || "0") : 0;

                // prev session / highest volume previous logic (simple)
                const { sessionStart, sessionEnd, prevSessionStart,
                  prevSessionEnd } = getSessions(timeframe);
                const candlesPrevSession = candles.filter((c) => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

                let highestVolumeColorPrev: "green" |
                  "red" | null = null;
                if (candlesPrevSession.length > 0) {
                  const hv = candlesPrevSession.reduce((a, b) => (a.volume > b.volume ? a : b));
                  highestVolumeColorPrev = hv.close > hv.open ? "green" : "red";
                }

                const sData: SymbolData = {
                  symbol,
                  candles,
                  closes,

                  rsi14,
                  priceChangePercent,
                  mainTrend: undefined,
                  prevClosedGreen: candles.length >= 2 ?
                    candles[candles.length - 2].close > candles[candles.length - 2].open : null,
                  prevClosedRed: candles.length >= 2 ?
                    candles[candles.length - 2].close < candles[candles.length - 2].open : null,
                  highestVolumeColorPrev,
                };
                symbolMapRef.current.set(symbol, sData);
              } catch (err) {
                console.warn("Error loading klines for", symbol, err);
              }
            })
          );
          // safe delay between REST batches
          await sleep(BATCH_DELAY_MS);
        }

        // 4) At this point we have initial data.
        // Start websockets to get live updates for those symbols.
        await startWebsocketsForSymbols(Array.from(symbolMapRef.current.keys()), timeframe);
        // 5) Start flush timer to push ref -> UI state at throttled interval
        startFlushTimer();
        setLastUpdated(new Date().toLocaleTimeString());
        setLoading(false);
      } catch (err) {
        console.error("Initialization error:", err);
        setLoading(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      cleanupSockets();
      stopFlushTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  /* --------------------------- WebSocket logic --------------------------- */
  async function startWebsocketsForSymbols(symbols: string[], tf: string) {
    cleanupSockets();
    // Build streams like: btcusdt@kline_15m
    const streams = symbols.map((s) => `${s.toLowerCase()}@kline_${tf}`);
    // Partition streams into GROUPS of SOCKET_MAX_STREAMS
    const groups: string[][] = [];
    for (let i = 0; i < streams.length; i += SOCKET_MAX_STREAMS) {
      groups.push(streams.slice(i, i + SOCKET_MAX_STREAMS));
    }

    groups.forEach((group, idx) => {
      const url = WS_BASE + group.join("/");
      const ws = new WebSocket(url);
      let backoff = 1000;

      ws.onopen = () => {
        console.log(`[WS ${idx}] open, streams: ${group.length}`);
        backoff = 1000;
      };

      ws.onmessage = (ev) => {
        try {

          const parsed = JSON.parse(ev.data);
          // Binance streams: payload in parsed.data for aggregated endpoint
          const data = parsed.data;
          if (!data || data.e !== "kline") return;
          const k = data.k; // kline object
          const symbol = data.s;
          // k: { t: openTime, T: closeTime,
          // s: symbol, i: interval, f, L, o, c, h, l, v, x: isFinal, q, n }
          handleKlineEvent(symbol, k);
        } catch (err) {
          console.warn("WS message parse error", err);
        }
      };

      ws.onerror = (err) => {
        console.warn(`[WS ${idx}] error`, err);
      };

      ws.onclose =
        (ev) => {
          console.warn(`[WS ${idx}] closed`, ev.code, ev.reason);
          // simple reconnect with backoff if component still mounted
          if (mountedRef.current) {
            setTimeout(() => {
              // re-create the socket for this particular group
              console.log(`[WS ${idx}] reconnecting...`);
              startWebsocketsForSymbols(group.map(s => s.split("@")[0].toUpperCase()), tf); // caution: re-subscribing group only
            }, backoff);
            backoff = Math.min(60_000, backoff * 2);
          }
        };

      socketsRef.current.push(ws);
    });
  }

  function cleanupSockets() {
    socketsRef.current.forEach((s) => {
      try {
        s.close();
      } catch (e) { }
    });
    socketsRef.current = [];
  }

  /* ------------------------ Kline event processing ---------------------- */
  function handleKlineEvent(symbol: string, k: any) {
    const sKey = symbol;
    const inMap = symbolMapRef.current.get(sKey);
    if (!inMap) {
      // optionally request klines for this newly seen symbol (skipped here)
      return;
    }
    // protect vs duplicate event processing
    const eventTs = k.t;
    // open time
    if (inMap.lastKlineEventTimestamp && eventTs <= inMap.lastKlineEventTimestamp) {
      return;
    }
    inMap.lastKlineEventTimestamp = eventTs;

    // build candle structure from kline payload
    const candle: Candle = {
      timestamp: k.t,
      open: +k.o,
      high: +k.h,
      low: +k.l,
      close: +k.c,
      volume: +k.v,
    };
    // if this kline is final (k.x === true) -> replace last candle and append
    const isFinal = k.x as boolean;
    // update candles array in-memory
    const candles = inMap.candles.slice();
    // shallow copy
    if (candles.length === 0) {
      candles.push(candle);
    } else {
      const last = candles[candles.length - 1];
      if (last.timestamp === candle.timestamp) {
        // update the last in place
        candles[candles.length - 1] = candle;
      } else if (candle.timestamp > last.timestamp) {
        // pushing a new candle
        candles.push(candle);
        // keep length capped at KLINE_LIMIT
        if (candles.length > KLINE_LIMIT) candles.shift();
      } else {
        // out of order old candle -> ignore
        return;
      }
    }

    // compute closes and RSI/EMA
    const closes = candles.map((c) => c.close);
    const rsi14 = calculateRSI(closes, 14);

    // keep prev candle info
    const prevClosedGreen = candles.length >= 2 ?
      candles[candles.length - 2].close > candles[candles.length - 2].open : null;
    const prevClosedRed = candles.length >= 2 ?
      candles[candles.length - 2].close < candles[candles.length - 2].open : null;

    // update mainTrend simplified using EMA70 & EMA200 (recalc)
    const ema70 = calculateEMA(closes, 70);
    const ema200 = calculateEMA(closes, 200);
    const lastEma70 = ema70.at(-1);
    const lastEma200 = ema200.at(-1);
    let mainTrend: MainTrend = {
      trend: "neutral",
      type: "none",
      crossoverPrice: 0,
      breakout: null,
      isNear: false,
      isDojiAfterBreakout: false,
    };
    if (typeof lastEma70 === "number" && typeof lastEma200 === "number" && !isNaN(lastEma70) && !isNaN(lastEma200)) {
      if (lastEma70 > lastEma200) {
        mainTrend.trend = "bullish";
        mainTrend.type = "support";
      } else {
        mainTrend.trend = "bearish";
        mainTrend.type = "resistance";
      }
    }

    // price change percent - we don't call per-symbol REST;
    // rely on bulk initial priceChangePercent if present
    // update the inMap object
    inMap.candles = candles;
    inMap.closes = closes;
    inMap.rsi14 = rsi14;
    inMap.prevClosedGreen = prevClosedGreen;
    inMap.prevClosedRed = prevClosedRed;
    inMap.mainTrend = mainTrend;
    // store back
    symbolMapRef.current.set(sKey, inMap);
  }

  /* ---------------------- UI flush throttle --------------------------- */
  function flushToState() {
    const arr = Array.from(symbolMapRef.current.values());
    setUiSymbols(arr);
    setLastUpdated(new Date().toLocaleTimeString());
  }

  function startFlushTimer() {
    stopFlushTimer();
    flushTimerRef.current = window.setInterval(() => {
      flushToState();
    }, UI_FLUSH_MS);
  }
  function stopFlushTimer() {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }

  /* -------------------------- Signal helpers -------------------------- */
  // Re-use your previously defined pump/dump logic here, e.g., getRecentRSIDiff & getSignal
  // For brevity, here's a simpler strong-signal check on RSI change
  function getRecentRSIDiff(rsi: number[], lookback = 14) {
    if (!Array.isArray(rsi) || rsi.length < lookback) return null;
    const recent = rsi.slice(-lookback).filter((v) => !isNaN(v));
    if (recent.length < lookback) return null;
    const recentHigh = Math.max(...recent);
    const recentLow = Math.min(...recent);
    const pumpStrength = recentHigh - recentLow;
    const start = recent[0];
    const end = recent[recent.length - 1];
    const direction = end > start ? "pump" : end < start ? "dump" : "neutral";
    const strength = Math.abs(end - start);
    return { recentHigh, recentLow, pumpStrength, direction, strength };
  }

  function getSignalForSymbol(s: SymbolData) {
    const pd = getRecentRSIDiff(s.rsi14 || [], 14);
    if (!pd) return "NO DATA";
    if (pd.direction === "pump" && pd.pumpStrength > 30) return "MAX ZONE PUMP";
    if (pd.direction === "dump" && pd.pumpStrength > 30) return "MAX ZONE DUMP";
    return "NO STRONG SIGNAL";
  }
  /* ------------------------------------------------------------------ */

  /* --------------------------- Memoized views ------------------------ */
  const bullFlagSymbols = useMemo(() => {
    return uiSymbols.filter((s) => {
      if (!s.rsi14 || s.rsi14.length < 1 || !s.closes || s.closes.length < 50) return false;
      if (getSignalForSymbol(s) !== "MAX ZONE PUMP") return false;
      const ema5 = calculateEMA(s.closes, 5).at(-1);
      const ema10 = calculateEMA(s.closes, 10).at(-1);
      const ema20 = calculateEMA(s.closes, 20).at(-1);
      const ema50 = calculateEMA(s.closes, 50).at(-1);

      const rsi = s.rsi14.at(-1);
      if (!ema5 || !ema10 || !ema20 || !ema50 || isNaN(Number(rsi))) return false;
      const isBullishEma = (ema5 as number) > (ema10 as number) && (ema10 as number) > (ema20 as number) && (ema20 as number) > (ema50 as number);
      return isBullishEma && (rsi as number) > 50;
    });
  }, [uiSymbols]);
  const bearFlagSymbols = useMemo(() => {
    return uiSymbols.filter((s) => {
      if (!s.rsi14 || s.rsi14.length < 1 || !s.closes || s.closes.length < 50) return false;
      if (getSignalForSymbol(s) !== "MAX ZONE DUMP") return false;
      const ema5 = calculateEMA(s.closes, 5).at(-1);
      const ema10 = calculateEMA(s.closes, 10).at(-1);
      const ema20 = calculateEMA(s.closes, 20).at(-1);
      const ema50 = calculateEMA(s.closes, 50).at(-1);
      const rsi = s.rsi14.at(-1);
      if
      (!ema5 || !ema10 || !ema20 || !ema50 || isNaN(Number(rsi))) return false;
      const isBearishEma = (ema5 as number) < (ema10 as number) && (ema10 as number) < (ema20 as number) && (ema20 as number) < (ema50 as number);
      return isBearishEma && (rsi as number) < 50;
    });
  }, [uiSymbols]);
  const marketStats = useMemo(() => {
    const greenPriceChangeCount = uiSymbols.filter((t) => Number(t.priceChangePercent || 0) > 0).length;
    const redPriceChangeCount = uiSymbols.filter((t) => Number(t.priceChangePercent || 0) < 0).length;
    const greenVolumeCount = uiSymbols.filter((s) => s.highestVolumeColorPrev === "green").length;
    const redVolumeCount = uiSymbols.filter((s) => s.highestVolumeColorPrev === "red").length;
    const bullishTrendCount = uiSymbols.filter((s) => s.mainTrend && s.mainTrend.trend === "bullish").length;
    const bearishTrendCount = uiSymbols.filter((s) => s.mainTrend && s.mainTrend.trend === "bearish").length;
    const maxPumpZoneCount = uiSymbols.filter((s) => getSignalForSymbol(s) === "MAX ZONE PUMP").length;
    const maxDumpZoneCount = uiSymbols.filter((s) => getSignalForSymbol(s) === "MAX ZONE DUMP").length;
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
  }, [uiSymbols, bullFlagSymbols, bearFlagSymbols]);

  /* -------------------------- Render UI ----------------------------- */
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-purple-400 mb-6 text-center">
          Crypto Signals Dashboard (WebSocket) 🚀
        </h1>

        <div className="flex justify-center mb-6 space-x-4">
          {["15m", "4h", "1d"].map((tf) => (

            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200
                ${timeframe === tf ? "bg-purple-600 text-white shadow-lg" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
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
          <h2 className="text-xl sm:text-2xl font-bold text-blue-300 mb-4 text-center">Market Overview</h2>
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
              <p className="text-lg
                font-semibold text-red-400">{marketStats.bearishTrendCount}</p>
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

        {loading && <div className="text-center text-lg text-gray-400 mt-10">Loading signals... This might take a moment.
          ⏳</div>}

        {!loading && bullFlagSymbols.length > 0 && (
          <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 mb-8 border border-blue-700">
            <h2 className="text-2xl sm:text-3xl font-bold text-blue-300 mb-5 text-center">Bull Flag Signals ({bullFlagSymbols.length})</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead
                  className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Current Price</th>
                    <th className="px-4 py-3 text-left text-xs
                      font-medium text-gray-300 uppercase tracking-wider">24h Change (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {bullFlagSymbols.map((s) => (
                    <tr key={s.symbol}>

                      <td className="px-4 py-4 text-blue-200 font-medium">{s.symbol}</td>
                      <td className="px-4 py-4 text-gray-200">${s.closes.at(-1)?.toFixed(2) ||
                        "N/A"}</td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${s.priceChangePercent && s.priceChangePercent > 0 ?
                          "text-green-400" : "text-red-400"}`}>
                          {s.priceChangePercent?.toFixed(2) ||
                            "N/A"}%
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
            <h2 className="text-2xl sm:text-3xl font-bold text-orange-300 mb-5 text-center">Bear Flag Signals ({bearFlagSymbols.length})</h2>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Symbol</th>

                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Current Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">24h Change (%)</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-gray-700">
                  {bearFlagSymbols.map((s) => (
                    <tr key={s.symbol}>
                      <td className="px-4 py-4 text-orange-200 font-medium">{s.symbol}</td>
                      <td className="px-4 py-4 text-gray-200">${s.closes.at(-1)?.toFixed(2) ||
                        "N/A"}</td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${s.priceChangePercent && s.priceChangePercent > 0 ?
                          "text-green-400" : "text-red-400"}`}>
                          {s.priceChangePercent?.toFixed(2) ||
                            "N/A"}%
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
          <div className="text-center text-lg text-gray-400 mt-10">No Bull or Bear Flag signals found for the selected timeframe.</div>
        )}

      </div>
    </div>
  );
}
