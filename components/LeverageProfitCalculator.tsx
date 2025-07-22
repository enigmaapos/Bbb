import { useState } from "react";

export default function LeverageProfitCalculator() {
  const [capital, setCapital] = useState(10);
  const [leverage, setLeverage] = useState(20);
  const [percentageMoves, setPercentageMoves] = useState<number[]>([4, 7, 10]);
  const [inputPercent, setInputPercent] = useState("");

  const positionSize = capital * leverage;
  const liquidationThreshold = 100 / leverage;

  const calculateProfit = (percent: number) => ((percent / 100) * positionSize).toFixed(2);
  const calculateLoss = (percent: number) => ((percent / 100) * positionSize).toFixed(2);

  const handleAddPercent = () => {
    const parsed = parseFloat(inputPercent);
    if (!isNaN(parsed)) {
      setPercentageMoves((prev) => [...new Set([...prev, parsed])].sort((a, b) => a - b));
      setInputPercent("");
    }
  };

  const handleRemove = (percent: number) => {
    setPercentageMoves((prev) => prev.filter((p) => p !== percent));
  };

  return (
    <div className="bg-gray-900 text-gray-200 border border-gray-700 rounded-lg p-4 mt-6 w-full max-w-md mx-auto">
      <h2 className="text-lg font-semibold text-white mb-4">📈 Leverage Profit & Loss Calculator</h2>

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
        <h3 className="text-sm text-gray-400 mb-2">💰 Estimated Gain/Loss:</h3>

        <div className="flex items-center gap-2 mb-3">
          <input
            type="number"
            placeholder="Add % move"
            value={inputPercent}
            onChange={(e) => setInputPercent(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-sm p-1 px-2 rounded w-24"
          />
          <button
            onClick={handleAddPercent}
            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded"
          >
            ➕ Add
          </button>
        </div>

        <ul className="space-y-2 text-sm">
          {percentageMoves.map((p) => {
            const isLiquidation = p >= liquidationThreshold;
            return (
              <li
                key={p}
                className={`flex flex-col gap-1 p-2 border rounded ${
                  isLiquidation ? "border-red-500 bg-red-900/40" : "border-gray-700"
                }`}
              >
                <div className="flex justify-between">
                  <span>📈 {p}% Gain → <span className="text-green-400">+${calculateProfit(p)}</span></span>
                  <span
                    onClick={() => handleRemove(p)}
                    className="cursor-pointer text-red-400 hover:text-red-600 text-xs"
                  >
                    ✖
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>
                    📉 {p}% Loss →{" "}
                    <span className={isLiquidation ? "text-red-500 font-bold" : "text-yellow-300"}>
                      -${calculateLoss(p)}
                    </span>
                  </span>
                  {isLiquidation && (
                    <span className="text-xs text-red-400 font-semibold">⚠️ Risk of Liquidation</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 text-xs text-yellow-300">
        ⚠️ Approx. liquidation threshold: <span className="font-bold">{liquidationThreshold.toFixed(2)}%</span> loss at {leverage}x leverage.
      </p>
    </div>
  );
}
