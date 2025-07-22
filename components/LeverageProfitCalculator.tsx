import { useState } from "react";

export default function LeverageProfitCalculator() {
  const [capital, setCapital] = useState(10);
  const [leverage, setLeverage] = useState(20);

  const percentageMoves = [4, 7, 10];

  const calculateProfit = (percent: number) => {
    const positionSize = capital * leverage;
    return ((percent / 100) * positionSize).toFixed(2);
  };

  return (
    <div className="bg-gray-900 text-gray-200 border border-gray-700 rounded-lg p-4 mt-6 w-full max-w-md mx-auto">
      <h2 className="text-lg font-semibold text-white mb-4">📈 Leverage Profit Calculator</h2>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-sm">🪙 Capital (Margin)</label>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(parseFloat(e.target.value))}
            className="bg-gray-800 border border-gray-600 text-sm p-1 px-2 rounded w-24 text-right"
            min={0}
          />
        </div>

        <div className="flex justify-between items-center">
          <label className="text-sm">📊 Leverage</label>
          <input
            type="number"
            value={leverage}
            onChange={(e) => setLeverage(parseFloat(e.target.value))}
            className="bg-gray-800 border border-gray-600 text-sm p-1 px-2 rounded w-24 text-right"
            min={1}
          />
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm text-gray-400 mb-2">💰 Estimated Profit at Various Moves:</h3>
        <ul className="space-y-1 text-sm">
          {percentageMoves.map((p) => (
            <li key={p}>
              🔸 {p}% move → <span className="text-green-400">+${calculateProfit(p)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-yellow-300">
        ⚠️ At 20x leverage, a 5% price drop may fully liquidate your margin. Use with caution.
      </p>
    </div>
  );
}
