// components/SiteADataLoader.tsx
import React, { useEffect, useState } from "react";

// You can define a more specific type if you know the structure of the data
interface SiteAData {
  // Example:
  message?: string;
  timestamp?: number;
  // ... any other properties from your Site A API
  [key: string]: any; // Allows for any other properties
}

const SiteADataLoader: React.FC = () => {
  const [siteAData, setSiteAData] = useState<SiteAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("https://ts-five-umber.vercel.app/api/data");
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        setSiteAData(data);
      } catch (err: any) {
        console.error("Fetch error for Site A data:", err);
        setError(`Failed to fetch data from Site A: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData(); // Fetch immediately on mount
    const intervalId = setInterval(fetchData, 60000); // Refresh every 60 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  return (
    <div className="mt-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
      <h2 className="text-xl font-bold text-yellow-300 mb-4 flex items-center">
        🔗 External Site A Data
        <span
          title="Data fetched from ts-five-umber.vercel.app/api/data"
          className="text-sm text-gray-400 ml-2 cursor-help"
        >
          ℹ️
        </span>
      </h2>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading external data...</p>
      ) : error ? (
        <div className="bg-red-900/40 border border-red-600 p-3 rounded-md text-red-300 text-sm">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      ) : siteAData ? (
        <div className="overflow-x-auto text-sm">
          <pre className="text-gray-200 whitespace-pre-wrap break-words p-2 bg-gray-700 rounded-md">
            {JSON.stringify(siteAData, null, 2)}
          </pre>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No data available from Site A.</p>
      )}
    </div>
  );
};

export default SiteADataLoader;
