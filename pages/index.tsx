import { useEffect, useState } from "react";
import axios from "axios";

export default function Home() {
  const [combinedData, setCombinedData] = useState<any[]>([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [greenTxnTotal, setGreenTxnTotal] = useState(0);
  const [redTxnTotal, setRedTxnTotal] = useState(0);
  const [marketBias, setMarketBias] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await axios.get("https://fapi.binance.com/fapi/v1/ticker/24hr");
        const data = res.data;

        // Filter out USDT pairs only
        const filtered = data.filter((item: any) => item.symbol.endsWith("USDT"));

        // Map combined data
        const combined = filtered.map((d: any) => ({
          symbol: d.symbol,
          priceChangePercent: parseFloat(d.priceChangePercent),
          volume: parseFloat(d.quoteVolume), // quoteVolume = txn liquidity in USDT
        }));

        setCombinedData(combined);

        // Count green/red coins
        const greens = combined.filter((d) => d.priceChangePercent >= 0);
        const reds = combined.filter((d) => d.priceChangePercent < 0);

        setGreenCount(greens.length);
        setRedCount(reds.length);

        // Transaction Liquidity (by Volume)
        const greenTxn = greens.reduce((sum, d) => sum + d.volume, 0);
        const redTxn = reds.reduce((sum, d) => sum + d.volume, 0);

        setGreenTxnTotal(greenTxn);
        setRedTxnTotal(redTxn);

        // Determine Market Bias
        if (greenTxn > redTxn && greens.length > reds.length) {
          setMarketBias("Bullish");
        } else if (redTxn > greenTxn && reds.length > greens.length) {
          setMarketBias("Bearish");
        } else {
          setMarketBias("Neutral");
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching Binance data:", error);
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every 1 min
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center py-10 px-6">
      <h1 className="text-3xl font-bold text-blue-400 mb-6">
        Binance Futures — Market Summary
      </h1>

      {loading ? (
        <p className="text-gray-400 animate-pulse">Loading market data...</p>
      ) : (
        <div className="bg-gray-800 shadow-xl rounded-2xl p-6 w-full max-w-2xl">
          <div className="text-sm space-y-4">
            {/* General Summary */}
            <div>
              <p className="text-gray-400 font-semibold mb-1">
                📊 General Market Overview:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <span className="text-green-400 font-semibold">Green Coins:</span>{" "}
                  {greenCount}
                </li>
                <li>
                  <span className="text-red-400 font-semibold">Red Coins:</span>{" "}
                  {redCount}
                </li>
                <li>
                  <span className="text-blue-400 font-semibold">Market Bias:</span>{" "}
                  <span
                    className={`font-bold ${
                      marketBias === "Bullish"
                        ? "text-green-400"
                        : marketBias === "Bearish"
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {marketBias}
                  </span>
                </li>
              </ul>
            </div>

            {/* Transaction Liquidity */}
            <div>
              <p className="text-gray-400 font-semibold mb-1">
                💰 Transaction Liquidity (by Volume):
              </p>
              <ul className="ml-4 text-gray-200 space-y-1 list-disc">
                <li>
                  <span className="text-green-400 font-semibold">
                    Green Total Txn Volume:
                  </span>{" "}
                  {greenTxnTotal.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  USDT
                </li>
                <li>
                  <span className="text-red-400 font-semibold">
                    Red Total Txn Volume:
                  </span>{" "}
                  {redTxnTotal.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  USDT
                </li>
                <li>
                  Dominant Liquidity Side:{" "}
                  <span
                    className={`font-bold ${
                      greenTxnTotal > redTxnTotal
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {greenTxnTotal > redTxnTotal
                      ? "Bullish (Green)"
                      : "Bearish (Red)"}
                  </span>
                </li>
              </ul>
            </div>

            {/* Extra Details */}
            <div className="pt-4 border-t border-gray-700">
              <p className="text-gray-500 text-xs italic">
                Updated every 1 minute using Binance Futures API. Txn volume
                represents total USDT traded per side across all perpetual
                pairs.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
