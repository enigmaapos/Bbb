import React, { useEffect, useState } from "react";

interface SignalItem {
  symbol: string;
  signal: string;
  latestRSI: number | null;
}

const SiteADataLoader: React.FC = () => {
  const [siteAData, setSiteAData] = useState<SignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("https://ts-five-umber.vercel.app/api/data");
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        setSiteAData(data);
      } catch (err: any) {
        console.error("Fetch error for Site A data:", err);
        setError(`Failed to fetch data from Site A: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 60000); // Refresh every 60s
    return () => clearInterval(intervalId);
  }, []);

  const getRSIText = (rsi: number | null): string => {
    if (typeof rsi !== "number") return "N/A";
    return rsi > 50 ? "Above 50 (Bullish)" : "Below 50 (Bearish)";
  };

  const getRSIColor = (rsi: number | null): string => {
    if (typeof rsi !== "number") return "text-gray-400";
    return rsi > 50 ? "text-green-400" : "text-red-400";
  };

  const getSignalColor = (signal: string): string => {
    switch (signal.trim()) {
      case "MAX ZONE PUMP":
        return "text-yellow-300";
      case "MAX ZONE DUMP":
        return "text-yellow-400";
      case "BALANCE ZONE PUMP":
        return "text-purple-300 font-bold";
      case "BUY SIGNAL":
        return "text-green-300";
      case "SELL SIGNAL":
        return "text-red-300";
      default:
        return "text-gray-300";
    }
  };

  return (
    <div className="mt-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
      <h2 className="text-xl font-bold text-yellow-300 mb-4">🔗 Site A Signal Data</h2>

      {loading ? (
        <p className="text-gray-400 text-sm animate-pulse">Loading data...</p>
      ) : error ? (
        <div className="bg-red-900/40 border border-red-600 p-3 rounded-md text-red-300 text-sm">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      ) : siteAData.length > 0 ? (
        <div className="overflow-x-auto text-sm">
          <table className="min-w-full border border-gray-600 text-left">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="px-3 py-2 border-b border-gray-600">Symbol</th>
                <th className="px-3 py-2 border-b border-gray-600">Signal</th>
                <th className="px-3 py-2 border-b border-gray-600">RSI</th>
              </tr>
            </thead>
            <tbody>
              {siteAData.map((s, i) => (
                <tr key={i} className="border-b border-gray-700">
                  <td className="px-3 py-2 text-white font-semibold">
                    {s.symbol.toUpperCase()}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${getSignalColor(s.signal)}`}>
                    {s.signal}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${getRSIColor(s.latestRSI)}`}>
                    {getRSIText(s.latestRSI)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No data found.</p>
      )}
    </div>
  );
};

export default SiteADataLoader;
