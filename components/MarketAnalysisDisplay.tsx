import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { MarketAnalysisResults, SymbolData } from '../types';

interface MarketAnalysisDisplayProps {
  marketAnalysis: MarketAnalysisResults;
  fundingImbalanceData: {
    priceUpShortsPaying: number;
    priceUpLongsPaying: number;
    priceDownLongsPaying: number;
    priceDownShortsPaying: number;
    topShortSqueeze: SymbolData[];
    topLongTrap: SymbolData[];
  };
  greenCount: number;
  redCount: number;
  greenPositiveFunding: number;
  greenNegativeFunding: number;
  redPositiveFunding: number;
  redNegativeFunding: number;
}

const formatVolume = (num: number): string => {
  if (num === 0) return "0";
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return formatter.format(num);
};

const MarketAnalysisDisplay: React.FC<MarketAnalysisDisplayProps> = ({
  marketAnalysis,
  fundingImbalanceData,
  greenCount,
  redCount,
  greenPositiveFunding,
  greenNegativeFunding,
  redPositiveFunding,
  redNegativeFunding,
}) => {
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    const handleClick = () => setChartKey((prev) => prev + 1);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const getScoreColor = (score: number) => {
    if (typeof score !== 'number') return "text-gray-500";
    if (score >= 7.5) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    if (score >= 4) return "text-orange-400";
    return "text-red-400";
  };

  const scoreToStars = (score: number) => {
    const safeScore = typeof score === 'number' ? score : 0;
    const numStars = Math.round(safeScore / 2);
    const clampedNumStars = Math.max(0, Math.min(5, numStars));
    return "⭐".repeat(clampedNumStars) + "☆".repeat(5 - clampedNumStars);
  };

  const sentimentScores = [
    marketAnalysis.generalBias?.score !== undefined && { name: 'Bias', score: marketAnalysis.generalBias.score },
    marketAnalysis.fundingImbalance?.score !== undefined && { name: 'Funding', score: marketAnalysis.fundingImbalance.score },
    marketAnalysis.shortSqueezeCandidates?.score !== undefined && { name: 'Squeeze', score: marketAnalysis.shortSqueezeCandidates.score },
    marketAnalysis.longTrapCandidates?.score !== undefined && { name: 'Long Trap', score: marketAnalysis.longTrapCandidates.score },
    marketAnalysis.volumeSentiment?.score !== undefined && { name: 'Volume', score: marketAnalysis.volumeSentiment.score },
    marketAnalysis.liquidationHeatmap?.score !== undefined && { name: 'Liquidation', score: marketAnalysis.liquidationHeatmap.score },
    marketAnalysis.newsSentiment?.score !== undefined && { name: 'News', score: marketAnalysis.newsSentiment.score },
    marketAnalysis.actionableSentimentSummary?.score !== undefined && { name: 'Actionable', score: marketAnalysis.actionableSentimentSummary.score },
  ].filter(Boolean) as { name: string; score: number }[];

  const CustomLegend = () => {
    const legendItems = [
      { value: 'Strong (7.5-10)', color: '#4ade80' },
      { value: 'Good (6-7.4)', color: '#facc15' },
      { value: 'Moderate (4-5.9)', color: '#f97316' },
      { value: 'Weak (0-3.9)', color: '#f87171' },
    ];

    return (
      <ul className="text-xs text-gray-300 flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
        {legendItems.map((entry, index) => (
          <li key={`legend-item-${index}`} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
            {entry.value}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mt-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md overflow-visible">
      <h2 className="text-xl font-bold text-white mb-4">
        🧠 Advanced Market Sentiment Analysis
        <span
          title="In-depth analysis of various market metrics to determine overall sentiment."
          className="text-sm text-gray-400 ml-2 cursor-help"
        >
          ℹ️
        </span>
      </h2>

      <p className="text-white text-sm font-bold mb-4">
        🌐 Overall Market Outlook:{" "}
        <span className={`${getScoreColor(marketAnalysis.overallMarketOutlook?.score || 0)} font-bold`}>
          {marketAnalysis.overallMarketOutlook?.tone || 'N/A'} (Score: {marketAnalysis.overallMarketOutlook?.score?.toFixed(1) || 'N/A'}){" "}
          {scoreToStars(marketAnalysis.overallMarketOutlook?.score || 0)}
        </span>
        <br />
        <span className="text-gray-400 italic text-xs ml-4">
          Strategy Suggestion: {marketAnalysis.overallMarketOutlook?.strategySuggestion || 'No suggestion available.'}
        </span>
      </p>

      <h3 className="text-lg font-semibold text-white mb-2 text-center">📊 Sentiment Scores Overview</h3>
        <div
  className="w-full max-w-[720px] h-[320px] mx-auto overflow-visible pointer-events-auto touch-auto"
  style={{ WebkitOverflowScrolling: 'auto' }}
>
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={sentimentScores}>
      <XAxis
        dataKey="name"
        stroke="#ccc"
        tick={{ fill: '#ccc', fontSize: 12 }}
        interval={0}
        angle={-30}
        textAnchor="end"
        height={60}
        label={{
          value: 'Sentiment Category',
          position: 'insideBottom',
          offset: -5,
          fill: '#fff',
        }}
      />
      <YAxis
        domain={[0, 10]}
        stroke="#ccc"
        tick={{ fill: '#ccc' }}
        label={{
          value: 'Score (0–10)',
          angle: -90,
          position: 'insideLeft',
          offset: 10,
          fill: '#ccc',
        }}
      />
      <Tooltip
        formatter={(value: number) => `${value.toFixed(1)}/10`}
        contentStyle={{
          backgroundColor: '#333',
          borderColor: '#555',
          color: '#fff',
          borderRadius: '4px',
          padding: '8px',
        }}
        labelStyle={{ color: '#fff' }}
      />
      <Legend wrapperStyle={{ paddingTop: '10px' }} content={<CustomLegend />} />
      <Bar dataKey="score" isAnimationActive={true}>
        {sentimentScores.map((entry, index) => (
          <Cell
            key={`cell-${index}`}
            fill={
              entry.score >= 7.5
                ? "#4ade80"
                : entry.score >= 6
                ? "#facc15"
                : entry.score >= 4
                ? "#f97316"
                : "#f87171"
            }
          />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
</div>

{/* Top Short Squeeze Candidates */}
      <div
  className="w-full max-w-[720px] h-[320px] mx-auto overflow-visible pointer-events-auto touch-auto"
  style={{ WebkitOverflowScrolling: 'auto' }}
>
      <div className="mb-4">
        <h3 className="text-yellow-400 font-semibold mb-1">🔥 Top Short Squeeze Candidates</h3>
          {marketAnalysis.shortSqueezeCandidates.rating} <span className="font-bold">({marketAnalysis.shortSqueezeCandidates.score.toFixed(1)}/10)</span>
        <p className="text-xs italic text-gray-400 mb-2">{marketAnalysis.shortSqueezeCandidates.interpretation}</p>
        <ul className="list-disc list-inside text-sm text-yellow-100">
          {fundingImbalanceData.topShortSqueeze.length > 0 ? (
            fundingImbalanceData.topShortSqueeze.map((d) => (
              <li key={d.symbol}>
                <span className="font-semibold">{d.symbol}</span> — Funding: <span className="text-green-300">{(d.fundingRate * 100).toFixed(4)}%</span> | Change: <span className="text-green-300">{d.priceChangePercent.toFixed(2)}%</span> | Volume: {formatVolume(d.volume)}
              </li>
            ))
          ) : (
            <li>No strong short squeeze candidates at the moment.</li>
          )}
        </ul>
      </div>

      {/* Top Long Trap Candidates */}
      <div className="mb-4">
        <h3 className="text-pink-400 font-semibold mb-1">⚠️ Top Long Trap Candidates</h3>
          {marketAnalysis.longTrapCandidates.rating} <span className="font-bold">({marketAnalysis.longTrapCandidates.score.toFixed(1)}/10)</span>
        <p className="text-xs italic text-gray-400 mb-2">{marketAnalysis.longTrapCandidates.interpretation}</p>
        <ul className="list-disc list-inside text-sm text-pink-100">
          {fundingImbalanceData.topLongTrap.length > 0 ? (
            fundingImbalanceData.topLongTrap.map((d) => (
              <li key={d.symbol}>
                <span className="font-semibold">{d.symbol}</span> — Funding: <span className="text-red-300">{(d.fundingRate * 100).toFixed(4)}%</span> | Change: <span className="text-red-300">{d.priceChangePercent.toFixed(2)}%</span> | Volume: {formatVolume(d.volume)}
              </li>
            ))
          ) : (
            <li>No strong long trap candidates at the moment.</li>
          )}
        </ul>
      </div>     
</div>

      
    </div>
  );
};

export default MarketAnalysisDisplay;
