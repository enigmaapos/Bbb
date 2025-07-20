import { useEffect, useState } from "react";

const BINANCE_API = "https://fapi.binance.com";

export default function PriceFundingTracker() {
  const [data, setData] = useState([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc' = positive first, 'asc' = negative first

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // 1. Get USDT perpetual symbols
        const infoRes = await fetch(`${BINANCE_API}/fapi/v1/exchangeInfo`);
        const infoData = await infoRes.json();
        const usdtPairs = infoData.symbols
          .filter((s) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s) => s.symbol);

        // 2. Fetch all 24h ticker data and funding rate data
        const [tickerRes, fundingRes] = await Promise.all([
          fetch(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          fetch(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const tickerData = await tickerRes.json();
        const fundingData = await fundingRes.json();

        // 3. Filter to only include our USDT pairs and join data
        const combinedData = usdtPairs.map((symbol) => {
          const ticker = tickerData.find((t) => t.symbol === symbol);
          const funding = fundingData.find((f) => f.symbol === symbol);
          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || 0),
            fundingRate: parseFloat(funding?.lastFundingRate || 0),
          };
        });

        // 4. Count green/red
        const green = combinedData.filter((d) => d.priceChangePercent >= 0).length;
        const red = combinedData.length - green;

        setGreenCount(green);
        setRedCount(red);

        // 5. Sort based on fundingRate
        const sorted = [...combinedData].sort((a, b) =>
          sortOrder === "desc"
            ? b.fundingRate - a.fundingRate
            : a.fundingRate - b.fundingRate
        );

        setData(sorted);
      } catch (err) {
        console.error("Error fetching Binance data:", err);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [sortOrder]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📈 Binance USDT Perpetual Tracker</h1>

        <div className="mb-4 flex justify-between items-center flex-wrap gap-4">
          <div className="text-lg">
            ✅ Green: <span className="text-green-400 font-bold">{greenCount}</span> &nbsp;&nbsp;
            ❌ Red: <span className="text-red-400 font-bold">{redCount}</span>
          </div>
          <div>
            <label className="mr-2 text-sm text-gray-400">Sort by Funding Fee:</label>
            <select
              className="bg-gray-700 text-white px-3 py-1 rounded"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="desc">🔼 Positive First</option>
              <option value="asc">🔽 Negative First</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
              <tr>
                <th className="p-2">Symbol</th>
                <th className="p-2">24h Change</th>
                <th className="p-2">Funding Fee</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.symbol} className="border-t border-gray-700">
                  <td className="p-2 font-medium">{item.symbol}</td>
                  <td className="p-2">
                    <span
                      className={
                        item.priceChangePercent >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {item.priceChangePercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        item.fundingRate >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {(item.fundingRate * 100).toFixed(4)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-gray-500 text-xs mt-4">
          Auto-refreshes every 10 seconds | Powered by Binance API
        </p>
      </div>
    </div>
  );
}
