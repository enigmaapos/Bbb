// src/components/MarketAnalysisDisplay.tsx

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { MarketAnalysisResults, SymbolData } from '../types';

interface MarketAnalysisDisplayProps {
  marketAnalysis: MarketAnalysisResults;
  showDetails: boolean;
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

const CustomBarLabel: React.FC<any> = ({ x, y, width, height, value }) => {
  const displayY = y - (value < 0 ? height : 0) - 5;
  let textColor = '#fff';
  if (typeof value === 'number') {
    if (value >= 7.5) textColor = '#4ade80';
    else if (value >= 6) textColor = '#facc15';
    else if (value >= 4) textColor = '#f97316';
    else textColor = '#f87171';
  }
  return (
    <text
      x={x + width / 2}
      y={displayY}
      fill={textColor}
      textAnchor="middle"
      dominantBaseline="auto"
      fontSize={12}
      fontWeight="bold"
    >
      {typeof value === 'number' ? value.toFixed(1) : value}
    </text>
  );
};


const MarketAnalysisDisplay: React.FC<MarketAnalysisDisplayProps> = ({
  marketAnalysis,
  showDetails
}) => {
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    const handleClick = () => setChartKey((prev) => prev + 1);
    return () => {};
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
      <div className="w-full max-w-[720px] h-[320px] mx-auto overflow-hidden touch-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sentimentScores}
            className="pointer-events-none"
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
            <Bar dataKey="score" isAnimationActive={true} label={<CustomBarLabel />}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      {/* General Bias */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-blue-300 mb-1">General Bias</h3>
        <p className="text-blue-300">{marketAnalysis.generalBias?.rating}</p>
        <p className="text-blue-200 text-xs mt-1">{marketAnalysis.generalBias?.interpretation}</p>
      </div>

      {/* Funding Imbalance */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-yellow-300 mb-1">🕵️ Funding Imbalance</h3>
        <p className="text-yellow-200">{marketAnalysis.fundingImbalance?.rating}</p>
        <p className="text-yellow-100 text-xs mt-1">
          {marketAnalysis.fundingImbalance?.interpretation || "Funding rates are diverging — potential trap setup forming, monitor for confirmation before acting."}
        </p>
      </div>

      {/* Top Short Squeeze Candidates */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-yellow-400 mb-1">🔥 Top Short Squeeze Candidates</h3>
        <p className="text-yellow-200">{marketAnalysis.shortSqueezeCandidates?.rating}</p>
        <p className="text-yellow-100 text-xs mt-1">{marketAnalysis.shortSqueezeCandidates?.interpretation}</p>

        <div className="mt-2 text-xs">
          <p className="font-semibold text-yellow-200">Candidates:</p>
          <ul className="list-disc list-inside text-yellow-100 text-sm">
            {marketAnalysis.marketData.topShortSqueeze.length > 0 ? (
              marketAnalysis.marketData.topShortSqueeze.map((d) => (
                <li key={d.symbol}>
                  <span className="font-semibold">{d.symbol}</span> — Funding: <span className="text-green-300">{(d.fundingRate * 100).toFixed(4)}%</span> | Change: <span className="text-green-300">{d.priceChangePercent.toFixed(2)}%</span> | Volume: {formatVolume(d.volume)}
                </li>
              ))
            ) : (
              <li>No strong short squeeze candidates at the moment.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Top Long Trap Candidates */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-pink-400 mb-1">⚠️ Top Long Trap Candidates</h3>
        <p className="text-pink-300">{marketAnalysis.longTrapCandidates?.rating}</p>
        <p className="text-pink-200 text-xs mt-1">{marketAnalysis.longTrapCandidates?.interpretation}</p>

        <div className="mt-2 text-xs">
          <p className="font-semibold text-pink-200">Candidates:</p>
          <ul className="list-disc list-inside text-pink-100 text-sm">
            {marketAnalysis.marketData.topLongTrap.length > 0 ? (
              marketAnalysis.marketData.topLongTrap.map((d) => (
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

      {/* Site A Data */}
      {marketAnalysis.siteAData && (
        <div className="p-3 bg-gray-700/50 rounded-md mb-4">
          <h3 className="font-semibold text-green-300 mb-1">📈 Site A Data</h3>
          <p className="text-green-200 text-xs mt-1">
            Long/Short Ratio: <span className="font-bold">{marketAnalysis.siteAData.longShortRatio.toFixed(2)}</span>
          </p>
          <p className="text-green-200 text-xs mt-1">
            Open Interest Change: <span className="font-bold">{marketAnalysis.siteAData.openInterestChange.toFixed(2)}%</span>
          </p>
          <p className="text-gray-400 text-xs mt-1">
            This data provides additional insight into market positioning and is crucial for detecting potential squeezes or traps.
          </p>
        </div>
      )}

      {/* Volume Sentiment */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-purple-300 mb-1">📊 Volume Sentiment</h3>
        <p className="text-purple-300">{marketAnalysis.volumeSentiment?.rating}</p>
        <p className="text-purple-200 text-xs mt-1">{marketAnalysis.volumeSentiment?.interpretation}</p>
      </div>

      {/* Liquidation Sentiment */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-pink-300 mb-1">💥 Liquidation Sentiment</h3>
        <p className="text-pink-300">{marketAnalysis.liquidationHeatmap?.rating}</p>
        <p className="text-pink-200 text-xs mt-1">{marketAnalysis.liquidationHeatmap?.interpretation}</p>
      </div>

      {/* News Sentiment */}
      <div className="p-3 bg-gray-700/50 rounded-md mb-4">
        <h3 className="font-semibold text-cyan-300 mb-1">📰 News Sentiment</h3>
        <p className="text-cyan-300">{marketAnalysis.newsSentiment?.rating}</p>
        <p className="text-cyan-200 text-xs mt-1">{marketAnalysis.newsSentiment?.interpretation}</p>

        {marketAnalysis.newsSentiment?.topHeadlines && (
          <div className="mt-2 text-xs">
            <p className="font-semibold text-cyan-200">Notable Headlines:</p>
            <ul className="list-disc list-inside text-gray-400">
              {marketAnalysis.newsSentiment.topHeadlines.slice(0, 3).map((title, i) => (
                <li key={i}>{title}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actionable Sentiment Signals */}
      {marketAnalysis.actionableSentimentSummary && (
        <div className="p-3 bg-gray-700/50 rounded-md mb-4">
          <h3 className="font-semibold text-indigo-300 mb-1">🔍 Actionable Sentiment Signals</h3>
          <p className="text-indigo-200 text-sm mb-1">
            Bullish Opportunities: <span className="font-bold">{marketAnalysis.actionableSentimentSummary.bullishCount}</span>
          </p>
          <p className="text-indigo-200 text-sm mb-1">
            Bearish Risks: <span className="font-bold">{marketAnalysis.actionableSentimentSummary.bearishCount}</span>
          </p>
          <p className="text-indigo-100 italic text-xs mt-1">{marketAnalysis.actionableSentimentSummary.interpretation}</p>
        </div>
      )}
    </div>

    </div>
  );
};

export default MarketAnalysisDisplay;
