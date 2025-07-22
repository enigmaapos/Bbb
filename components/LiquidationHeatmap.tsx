// components/LiquidationHeatmap.tsx
import { useEffect, useState } from "react";

type LiquidationEvent = {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timestamp: number;
};

export default function LiquidationHeatmap() {
  const [events, setEvents] = useState<LiquidationEvent[]>([]);

  useEffect(() => {
    // Note: Binance WebSocket URLs typically start with wss:// for secure connection.
    // For production, you might want to use a more robust WebSocket library or handle reconnections.
    const ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");

    ws.onopen = () => {
      console.log("WebSocket connected for liquidations.");
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        // Binance's !forceOrder@arr stream sends an array of liquidation events
        // each event has 'o' object containing order details
        const evts = data.map((o: any) => ({
          symbol: o.o.s as string,
          side: o.o.S as "BUY" | "SELL",
          price: parseFloat(o.o.p),
          quantity: parseFloat(o.o.q),
          timestamp: o.E as number,
        }));
        // Prepend new events and keep only the latest 500 to prevent memory issues
        setEvents((prev) => [...evts, ...prev].slice(0, 500));
      } catch (e) {
        console.error("Error parsing WebSocket message for liquidations:", e);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error for liquidations:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected for liquidations.");
    };

    // Clean up the WebSocket connection when the component unmounts
    return () => {
      ws.close();
    };
  }, []);

  // TODO: Aggregate events into price buckets and render a heatmap UI
  // For now, it displays a raw list of recent events.
  // A proper heatmap would involve:
  // 1. Grouping events by symbol or price range.
  // 2. Calculating total liquidation volume for each group.
  // 3. Representing this data visually (e.g., using a bar chart or colored cells).
  return (
    <div className="mt-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
      <h2 className="text-xl font-bold text-red-400 mb-3">💥 Real-Time Liquidation Events</h2>
      <p className="text-sm text-gray-400 mb-2">
        Monitoring **forced liquidations** can indicate market sentiment shifts and potential volatility.
      </p>
      <ul className="text-xs text-gray-300 max-h-64 overflow-y-auto custom-scrollbar">
        {events.length > 0 ? (
          events.slice(0, 50).map((e, i) => ( // Displaying top 50 for readability
            <li
              key={`${e.symbol}-${e.timestamp}-${i}`}
              className={`py-1 px-2 mb-0.5 rounded ${
                e.side === "SELL" ? "bg-red-900/40 text-red-200" : "bg-green-900/40 text-green-200"
              } flex justify-between items-center`}
            >
              <span className="font-semibold">{e.symbol}</span>
              <span className="mx-2">
                {e.side === "SELL" ? "🔻" : "🔺"} {e.quantity.toFixed(4)}@{e.price.toFixed(2)}
              </span>
              <span className="text-gray-400 text-right">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
            </li>
          ))
        ) : (
          <li className="text-center text-gray-500 py-4">No recent liquidation events.</li>
        )}
      </ul>
      <p className="text-gray-500 text-xs mt-3">
        *This is a raw feed. A true "heatmap" would aggregate volume by price levels.*
      </p>
    </div>
  );
}
