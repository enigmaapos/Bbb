import { useEffect, useState } from "react";

const BINANCE_API = "https://fapi.binance.com";

type SymbolData = {
  symbol: string;
  priceChangePercent: number;
  fundingRate: number;
};

export default function PriceFundingTracker() {
  const [data, setData] = useState<SymbolData[]>([]);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);

  const [greenPositiveFunding, setGreenPositiveFunding] = useState(0);
  const [greenNegativeFunding, setGreenNegativeFunding] = useState(0);
  const [redPositiveFunding, setRedPositiveFunding] = useState(0);
  const [redNegativeFunding, setRedNegativeFunding] = useState(0);

  const [sortBy, setSortBy] = useState<"fundingRate" | "priceChangePercent">("fundingRate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const infoRes = await fetch(`${BINANCE_API}/fapi/v1/exchangeInfo`);
        const infoData = await infoRes.json();
        const usdtPairs = infoData.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.symbol.endsWith("USDT"))
          .map((s: any) => s.symbol);

        const [tickerRes, fundingRes] = await Promise.all([
          fetch(`${BINANCE_API}/fapi/v1/ticker/24hr`),
          fetch(`${BINANCE_API}/fapi/v1/premiumIndex`),
        ]);

        const tickerData = await tickerRes.json();
        const fundingData = await fundingRes.json();

        const combinedData: SymbolData[] = usdtPairs.map((symbol: string) => {
          const ticker = tickerData.find((t: any) => t.symbol === symbol);
          const funding = fundingData.find((f: any) => f.symbol === symbol);
          return {
            symbol,
            priceChangePercent: parseFloat(ticker?.priceChangePercent || "0"),
            fundingRate: parseFloat(funding?.lastFundingRate || "0"),
          };
        });

        const green = combinedData.filter((d) => d.priceChangePercent >= 0).length;
        const red = combinedData.length - green;
        setGreenCount(green);
        setRedCount(red);

        // New funding classification counts
        const gPos = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate >= 0).length;
        const gNeg = combinedData.filter((d) => d.priceChangePercent >= 0 && d.fundingRate < 0).length;
        const rPos = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate >= 0).length;
        const rNeg = combinedData.filter((d) => d.priceChangePercent < 0 && d.fundingRate < 0).length;

        setGreenPositiveFunding(gPos);
        setGreenNegativeFunding(gNeg);
        setRedPositiveFunding(rPos);
        setRedNegativeFunding(rNeg);

        const sorted = [...combinedData].sort((a, b) =>
          sortOrder === "desc"
            ? b[sortBy] - a[sortBy]
            : a[sortBy] - b[sortBy]
        );

        setData(sorted);
      } catch (err) {
        console.error("Error fetching Binance data:", err);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [sortBy, sortOrder]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📈 Binance USDT Perpetual Tracker</h1>

        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-sm space-y-1">
            <div>
              ✅ Green: <span className="text-green-400 font-bold">{greenCount}</span> 
              &nbsp;&nbsp;❌ Red: <span className="text-red-400 font-bold">{redCount}</span>
            </div>
            <div>
              Green + Funding ➕: <span className="text-green-300">{greenPositiveFunding}</span> | 
              ➖: <span className="text-yellow-300">{greenNegativeFunding}</span>
            </div>
            <div>
              Red + Funding ➕: <span className="text-green-300">{redPositiveFunding}</span> | 
              ➖: <span className="text-yellow-300">{redNegativeFunding}</span>
            </div>
          </div>
        </div>

        <div className="overflow-auto mt-4">
          <table className="w-full text-sm text-left border border-gray-700">
            <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
              <tr>
                <th className="p-2">Symbol</th>

                <th
                  className="p-2 cursor-pointer select-none"
                  onClick={() => {
                    if (sortBy === "priceChangePercent") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("priceChangePercent");
                      setSortOrder("desc");
                    }
                  }}
                >
                  <span
                    className={sortBy === "priceChangePercent" ? "font-bold underline" : ""}
                  >
                    24h Change{" "}
                    {sortBy === "priceChangePercent" &&
                      (sortOrder === "asc" ? "🔼" : "🔽")}
                  </span>
                </th>

                <th
                  className="p-2 cursor-pointer select-none"
                  onClick={() => {
                    if (sortBy === "fundingRate") {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortBy("fundingRate");
                      setSortOrder("desc");
                    }
                  }}
                >
                  <span className={sortBy === "fundingRate" ? "font-bold underline" : ""}>
                    Funding Fee{" "}
                    {sortBy === "fundingRate" &&
                      (sortOrder === "asc" ? "🔼" : "🔽")}
                  </span>
                </th>
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
