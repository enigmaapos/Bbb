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
         <div className="w-full max-w-[720px] h-[320px] mx-auto overflow-hidden touch-none">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sentimentScores}
          className="pointer-events-none" // disables click/tap
        >
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
              fill: '#ccc',
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
          <Bar
            dataKey="score"
            animationDuration={800}
            animationEasing="ease-out"
            className="pointer-events-none" // disables tap on bars specifically
          >
            {sentimentScores.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.score >= 7.5
                    ? '#4ade80'
                    : entry.score >= 6
                    ? '#facc15'
                    : entry.score >= 4
                    ? '#f97316'
                    : '#f87171'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>

{/* Short Squeeze */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-green-300 mb-1">Short Squeeze Potential</h3>
          <p className="text-green-300">{marketAnalysis.shortSqueezeCandidates?.rating || 'N/A'}</p>
          <p className="text-green-200 text-xs mt-1">{marketAnalysis.shortSqueezeCandidates?.interpretation || 'No interpretation available.'}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.shortSqueezeCandidates?.score || 0)}`}>
            Score: {marketAnalysis.shortSqueezeCandidates?.score?.toFixed(1) || 'N/A'}
          </p>
          {fundingImbalanceData.topShortSqueeze.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-semibold text-green-200">Top Candidates:</p>
              <ul className="list-disc list-inside text-gray-400">
                {fundingImbalanceData.topShortSqueeze.map((s) => (
                  <li key={s.symbol}>
                    {s.symbol} ({s.priceChangePercent.toFixed(1)}% | {(s.fundingRate * 100).toFixed(3)}% | ${formatVolume(s.volume)})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Long Trap */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-red-300 mb-1">Long Trap Risk</h3>
          <p className="text-red-300">{marketAnalysis.longTrapCandidates?.rating || 'N/A'}</p>
          <p className="text-red-200 text-xs mt-1">{marketAnalysis.longTrapCandidates?.interpretation || 'No interpretation available.'}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.longTrapCandidates?.score || 0)}`}>
            Score: {marketAnalysis.longTrapCandidates?.score?.toFixed(1) || 'N/A'}
          </p>
          {fundingImbalanceData.topLongTrap.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-semibold text-red-200">Top Candidates:</p>
              <ul className="list-disc list-inside text-gray-400">
                {fundingImbalanceData.topLongTrap.map((s) => (
                  <li key={s.symbol}>
                    {s.symbol} ({s.priceChangePercent.toFixed(1)}% | {(s.fundingRate * 100).toFixed(3)}% | ${formatVolume(s.volume)})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      
    </div>
  );
};

export default MarketAnalysisDisplay;
