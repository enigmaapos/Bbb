// components/FundingSentimentChart.tsx
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend,
} from "recharts";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 text-white text-xs p-2 border border-gray-600 rounded">
        <p>{payload[0].payload.category}</p>
        <p className="text-red-400">Funding ➕ (Longs Paying): {payload[0].value}</p>
        <p className="text-green-400">Funding ➖ (Shorts Paying): {payload[1].value}</p>
      </div>
    );
  }
  return null;
};

// ✅ Custom XAxis tick renderer
const CustomCategoryTick = ({ x, y, payload }: any) => {
  const isGreen = payload.value === "Green";
  const color = isGreen ? "#10B981" : "#EF4444";
  return (
    <text
      x={x}
      y={y + 10}
      fill={color}
      textAnchor="middle"
      fontSize={12}
      fontWeight={600}
    >
      {payload.value}
    </text>
  );
};

export default function FundingSentimentChart({
  greenPositiveFunding,
  greenNegativeFunding,
  redPositiveFunding,
  redNegativeFunding,
}: {
  greenPositiveFunding: number;
  greenNegativeFunding: number;
  redPositiveFunding: number;
  redNegativeFunding: number;
}) {
  const data = [
    {
      category: "Green", // Price Up
      Positive: greenPositiveFunding,
      Negative: greenNegativeFunding,
    },
    {
      category: "Red", // Price Down
      Positive: redPositiveFunding,
      Negative: redNegativeFunding,
    },
  ];

  return (
    <div className="mt-6">
      <h2 className="text-white font-bold text-lg mb-2">📊 Funding Sentiment Breakdown</h2>

      <div className="pointer-events-auto">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis dataKey="category" tick={<CustomCategoryTick />} />
          <YAxis stroke="#aaa" />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ color: "#E5E7EB", fontSize: "12px", marginTop: "10px" }}
          />

          {/* Funding ➕ (Longs Paying) */}
          <Bar dataKey="Positive" stackId="a" name="Funding ➕ (Longs Paying)">
            {data.map((entry, index) => (
              <Cell
                key={`positive-${index}`}
                fill={entry.category === "Green" ? "#F87171" : "#B91C1C"}
              />
            ))}
          </Bar>

          {/* Funding ➖ (Shorts Paying) */}
          <Bar dataKey="Negative" stackId="a" name="Funding ➖ (Shorts Paying)">
            {data.map((entry, index) => (
              <Cell
                key={`negative-${index}`}
                fill={entry.category === "Green" ? "#6EE7B7" : "#047857"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
</div>
      
      <p className="text-gray-400 text-xs mt-2">
        🟥 Funding ➕ = Longs paying (bearish pressure) | 🟩 Funding ➖ = Shorts paying (bullish pressure)
      </p>

      {/* Recap Summary */}
      <div className="mt-4 p-4 border border-gray-700 bg-gray-900 rounded-lg text-sm text-gray-200 space-y-2">
        <h3 className="font-semibold text-white">📌 Chart Interpretation Recap:</h3>

        <div>
          🟢 <span className="font-semibold">Green Group (Price Up)</span><br />
          - 🟥 High Funding ➕: Bull trap risk<br />
          - 🟩 High Funding ➖: Bullish squeeze setup
        </div>

        <div>
          🔴 <span className="font-semibold">Red Group (Price Down)</span><br />
          - 🟥 High Funding ➕: Bearish trap → deeper downside<br />
          - 🟩 High Funding ➖: Potential reversal forming
        </div>

        <div className="pt-2 text-xs text-gray-400">
          ✅ Tip: Watch for green bars rising in red group for early reversal. Avoid longs when red bars dominate in red group.
        </div>
      </div>

      {/* Cheatsheet */}
      <div className="mt-4 p-4 border border-gray-700 bg-gray-800 rounded-lg text-sm text-gray-200 space-y-2">
        <h3 className="font-semibold text-white">🧠 Interpretation Cheatsheet:</h3>
        <table className="text-sm text-gray-300 w-full table-fixed">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left w-1/2">Condition</th>
              <th className="text-left w-1/2">Meaning</th>
            </tr>
          </thead>
          <tbody className="mt-1 space-y-2">
            <tr>
              <td>🟥 &gt; 🟩 in Green Group</td>
              <td>🚨 Bull Trap Risk</td>
            </tr>
            <tr>
              <td>🟩 &gt; 🟥 in Green Group</td>
              <td>✅ Real Bullish Momentum</td>
            </tr>
            <tr>
              <td>🟥 &gt; 🟩 in Red Group</td>
              <td>⚠️ Bearish Continuation / Trap</td>
            </tr>
            <tr>
              <td>🟩 &gt; 🟥 in Red Group</td>
              <td>🔁 Short Covering / Reversal Zone</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
