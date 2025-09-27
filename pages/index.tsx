// pages/index.tsx
import { useEffect, useState, useMemo } from "react";
import Head from "next/head";
import axios from "axios";

function isAxiosErrorTypeGuard(error: any): error is import("axios").AxiosError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    error.isAxiosError === true
  );
}

const BINANCE_API = "https://fapi.binance.com";

const formatDavaoTime = (): string => {
  const now = new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(now);
};

// --- TEMPORARY SymbolData DEFINITION ---
// (move to types.ts later if you prefer)
interface SymbolData {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
  lastPrice: number;
  volume: number;
}

interface BinanceSymbol {
  symbol: string;
  contractType: string;
}

interface BinanceExchangeInfoResponse {
  symbols: BinanceSymbol[];
}

interface BinanceTicker24hr {
  symbol: string;
  priceChangePercent: string;
  lastPrice: string;
  quoteVolume: string;
}

interface BinancePremiumIndex {
  symbol: string;
  lastFundingRate: string;
}

export default function PriceFundingTracker() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rawData, setRawData] = useState<SymbolData[]>([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // sorting/filtering (kept in case table added later)
  const [sortConfig, setSortConfig] = useState<{
    key: "fundingRate" | "priceChangePercent" | null;
    direction: "asc" | "desc" | null;
  }>({ key: "fundingRate", direction: "desc" });

  const [searchTerm, setSearchTerm] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const savedFavorites = localStorage.getItem("favorites");
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    }
    return [];
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // --- Main Data Fetching ---
  useEffect(() => {
    const fetchAllData = async () => {
      if (rawData.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        const [infoRes, tickerRes, fundingRes] = await Promise.all([
          axios.get<BinanceExchangeInfoResponse>(`${BINANCE_API}/fapi/v1/exchangeInfo`),
          axios.get<BinanceTicker24hr[]>(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          axios.get<BinancePremiumIndex[]>(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const usdtPairs = infoRes.data.symbols
          .filter((s: BinanceSymbol) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: BinanceSymbol) => s.symbol);

        const tickerData = tickerRes.data;
        const fundingData = fundingRes.data;

        const combinedData: SymbolData[] = usdtPairs
          .map((symbol: string) => {
            const ticker = tickerData.find((t) => t.symbol === symbol);
            const funding = fundingData.find((f) => f.symbol === symbol);
            return {
              symbol,
              priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
              fundingRate: parseFloat(funding?.lastFundingRate || "0"),
              lastPrice: parseFloat(ticker?.lastPrice || "0"),
              volume: parseFloat(ticker?.quoteVolume || "0"),
            };
          })
          .filter((d: SymbolData) => d.volume > 0);

        setRawData(combinedData);

        const green = combinedData.filter((d) => d.priceChangePercent >= 0).length;
        const red = combinedData.length - green;
        setGreenCount(green);
        setRedCount(red);

        setLastUpdated(formatDavaoTime());
      } catch (err: any) {
        console.error("Error fetching market data:", err);
        if (isAxiosErrorTypeGuard(err) && err.response) {
          setError(`Failed to fetch market data: ${err.response.status}`);
        } else {
          setError("Failed to fetch market data. Unknown error.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);

    return () => clearInterval(interval);
  }, [rawData.length]);

  const sortedData = useMemo(() => {
    const sortableData = [...rawData];
    if (!sortConfig.key) return sortableData;

    return sortableData.sort((a, b) => {
      const order = sortConfig.direction === "asc" ? 1 : -1;
      if (sortConfig.key === "fundingRate") {
        return (a.fundingRate - b.fundingRate) * order;
      } else if (sortConfig.key === "priceChangePercent") {
        return (a.priceChangePercent - b.priceChangePercent) * order;
      }
      return 0;
    });
  }, [rawData, sortConfig]);

  const filteredAndSortedData = useMemo(() => {
    return sortedData.filter(
      (item) =>
        (!searchTerm || item.symbol.includes(searchTerm)) &&
        (!showFavoritesOnly || favorites.includes(item.symbol))
    );
  }, [sortedData, searchTerm, showFavoritesOnly, favorites]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen text-white text-lg bg-gray-900">
        Loading market data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen text-red-500 text-lg bg-gray-900">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <Head>
        <title>Binance USDT Perpetual Tracker</title>
        <meta
          name="description"
          content="Real-time Binance USDT Perpetual Tracker with General Market Bias"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-3 text-blue-400">
          📈 Binance USDT Perpetual Tracker
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Last Updated (Davao City): {lastUpdated}
        </p>

        {/* --- Market Summary (ONLY General Market Bias) --- */}
        <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
          <h2 className="text-lg font-bold text-white mb-3">
            📊 Market Summary
            <span
              title="Shows the number of symbols in profit vs loss (Green vs Red)"
              className="text-sm text-gray-400 ml-2 cursor-help"
            >
              ℹ️
            </span>
          </h2>

          <div className="text-sm">
            <p className="text-gray-400 font-semibold mb-1">
              🧮 General Market Bias:
            </p>
            ✅{" "}
            <span className="text-green-400 font-bold">Green</span>: {greenCount}{" "}
            &nbsp;&nbsp;
            ❌ <span className="text-red-400 font-bold">Red</span>: {redCount}
          </div>
        </div>
      </div>
    </div>
  );
}
