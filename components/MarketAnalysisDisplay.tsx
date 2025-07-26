import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'; // Make sure Legend is imported
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
  const getScoreColor = (score: number) => {
    if (score >= 7.5) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    if (score >= 4) return "text-orange-400";
    return "text-red-400";
  };

  const scoreToStars = (score: number) => {
    const numStars = Math.round(score / 2);
    return "⭐".repeat(numStars) + "☆".repeat(5 - numStars);
  };

  // Improved sentimentScores array construction for robustness
  const sentimentScores = [
    marketAnalysis.generalBias?.score !== undefined && {
      name: 'Bias',
      score: marketAnalysis.generalBias.score,
    },
    marketAnalysis.fundingImbalance?.score !== undefined && {
      name: 'Funding',
      score: marketAnalysis.fundingImbalance.score,
    },
    marketAnalysis.shortSqueezeCandidates?.score !== undefined && {
      name: 'Squeeze',
      score: marketAnalysis.shortSqueezeCandidates.score,
    },
    marketAnalysis.longTrapCandidates?.score !== undefined && {
      name: 'Long Trap',
      score: marketAnalysis.longTrapCandidates.score,
    },
    marketAnalysis.volumeSentiment?.score !== undefined && {
      name: 'Volume',
      score: marketAnalysis.volumeSentiment.score,
    },
    marketAnalysis.liquidationHeatmap?.score !== undefined && {
      name: 'Liquidation',
      score: marketAnalysis.liquidationHeatmap.score,
    },
    marketAnalysis.newsSentiment?.score !== undefined && {
      name: 'News',
      score: marketAnalysis.newsSentiment.score,
    },
    marketAnalysis.actionableSentimentSummary?.score !== undefined && {
      name: 'Actionable',
      score: marketAnalysis.actionableSentimentSummary.score,
    },
  ].filter(Boolean) as { name: string; score: number }[]; // Filter out false/undefined entries

  // Define the type for Legend payload items for clarity
  type LegendPayloadItem = {
    value: string;
    type: 'rect' | 'circle' | 'line' | 'star' | 'triangle' | 'diamond' | 'square' | 'cross' | 'wye' | 'none';
    color: string;
  };

  const legendPayload: LegendPayloadItem[] = [
    { value: 'Strong (7.5-10)', type: 'rect', color: '#4ade80' },
    { value: 'Good (6-7.4)', type: 'rect', color: '#facc15' },
    { value: 'Moderate (4-5.9)', type: 'rect', color: '#f97316' },
    { value: 'Weak (0-3.9)', type: 'rect', color: '#f87171' },
  ];

  return (
    <div className="mt-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
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
        <span className={`${getScoreColor(marketAnalysis.overallMarketOutlook.score)} font-bold`}>
          {marketAnalysis.overallMarketOutlook.tone} (Score: {marketAnalysis.overallMarketOutlook.score.toFixed(1)}/10){" "}
          {scoreToStars(marketAnalysis.overallMarketOutlook.score)}
        </span>
        <br />
        <span className="text-gray-400 italic text-xs ml-4">
          Strategy Suggestion: {marketAnalysis.overallMarketOutlook.strategySuggestion}
        </span>
      </p>

      {/* Chart with title */}
      <h3 className="text-lg font-semibold text-white mb-2 text-center">
        📊 Sentiment Scores Overview
      </h3>
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sentimentScores}>
            {/* XAxis with Label */}
            <XAxis
              dataKey="name"
              stroke="#ccc"
              tick={{ fill: '#ccc' }}
              label={{ value: 'Sentiment Category', position: 'insideBottom', offset: -5, fill: '#ccc' }}
            />
            {/* YAxis with Label */}
            <YAxis
              domain={[0, 10]}
              stroke="#ccc"
              tick={{ fill: '#ccc' }}
              label={{ value: 'Score (0-10)', angle: -90, position: 'insideLeft', offset: 10, fill: '#ccc' }}
            />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(1)}/10`}
              contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#fff' }}
              labelStyle={{ color: '#fff' }}
            />
            {/* Using the typed legendPayload for custom legend */}
            <Legend
                wrapperStyle={{ color: '#ccc', paddingTop: '10px' }} // Style for the Legend wrapper
                payload={legendPayload}
            />
            <Bar dataKey="score">
              {sentimentScores.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.score >= 7.5
                      ? "#4ade80" // green
                      : entry.score >= 6
                      ? "#facc15" // yellow
                      : entry.score >= 4
                      ? "#f97316" // orange
                      : "#f87171" // red
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        {/* General Bias */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-blue-300 mb-1">General Bias</h3>
          <p className="text-blue-300">{marketAnalysis.generalBias?.rating}</p> {/* Added optional chaining */}
          <p className="text-blue-200 text-xs mt-1">{marketAnalysis.generalBias?.interpretation}</p> {/* Added optional chaining */}
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.generalBias?.score || 0)}`}> {/* Added optional chaining and default */}
            Score: {marketAnalysis.generalBias?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* Funding Imbalance */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-yellow-300 mb-1">🕵️ Funding Imbalance</h3>
          <p className="text-yellow-200">{marketAnalysis.fundingImbalance?.rating}</p> {/* Added optional chaining */}
          <p className="text-yellow-100 text-xs mt-1">
            {marketAnalysis.fundingImbalance?.interpretation || "Funding rates are diverging — potential trap setup forming, monitor for confirmation before acting."}
          </p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.fundingImbalance?.score || 0)}`}> {/* Added optional chaining and default */}
            Score: {marketAnalysis.fundingImbalance?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* Short Squeeze */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-green-300 mb-1">Short Squeeze Potential</h3>
          <p className="text-green-300">{marketAnalysis.shortSqueezeCandidates?.rating}</p> {/* Added optional chaining */}
          <p className="text-green-200 text-xs mt-1">{marketAnalysis.shortSqueezeCandidates?.interpretation}</p> {/* Added optional chaining */}
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.shortSqueezeCandidates?.score || 0)}`}> {/* Added optional chaining and default */}
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
          <p className="text-red-300">{marketAnalysis.longTrapCandidates?.rating}</p> {/* Added optional chaining */}
          <p className="text-red-200 text-xs mt-1">{marketAnalysis.longTrapCandidates?.interpretation}</p> {/* Added optional chaining */}
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.longTrapCandidates?.score || 0)}`}> {/* Added optional chaining and default */}
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

        {/* Volume Sentiment */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-purple-300 mb-1">Volume Sentiment</h3>
          <p className="text-purple-300">{marketAnalysis.volumeSentiment?.rating}</p> {/* Added optional chaining */}
          <p className="text-purple-200 text-xs mt-1">{marketAnalysis.volumeSentiment?.interpretation}</p> {/* Added optional chaining */}
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.volumeSentiment?.score || 0)}`}> {/* Added optional chaining and default */}
            Score: {marketAnalysis.volumeSentiment?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* Liquidation Heatmap */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-pink-300 mb-1">Liquidation Sentiment</h3>
          <p className="text-pink-300">{marketAnalysis.liquidationHeatmap?.rating}</p> {/* Added optional chaining */}
          <p className="text-pink-200 text-xs mt-1">{marketAnalysis.liquidationHeatmap?.interpretation}</p> {/* Added optional chaining */}
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.liquidationHeatmap?.score || 0)}`}> {/* Added optional chaining and default */}
            Score: {marketAnalysis.liquidationHeatmap?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* News Sentiment */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-cyan-300 mb-1">📰 News Sentiment</h3>
          <p className="text-cyan-300">{marketAnalysis.newsSentiment?.rating}</p> {/* Added optional chaining */}
          <p className="text-cyan-200 text-xs mt-1">{marketAnalysis.newsSentiment?.interpretation}</p> {/* Added optional chaining */}
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.newsSentiment?.score || 0)}`}> {/* Added optional chaining and default */}
            Score: {marketAnalysis.newsSentiment?.score?.toFixed(1) || 'N/A'}
          </p>
          {marketAnalysis.newsSentiment?.topHeadlines && ( // Added optional chaining
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

        {/* Actionable Sentiment Signals Summary */}
        {marketAnalysis.actionableSentimentSummary && (
          <div className="p-4 mb-4 bg-gray-700 rounded-md border border-gray-600">
            <h3 className="font-semibold text-indigo-300 mb-2">🔍 Actionable Sentiment Signals</h3>
            <p className="text-indigo-200 mb-1">
              Bullish Opportunities: <span className="font-bold">{marketAnalysis.actionableSentimentSummary.bullishCount}</span>
            </p>
            <p className="text-indigo-200 mb-1">
              Bearish Risks: <span className="font-bold">{marketAnalysis.actionableSentimentSummary.bearishCount}</span>
            </p>
            <p className={`font-bold ${getScoreColor(marketAnalysis.actionableSentimentSummary.score)}`}>
              Overall Tone: {marketAnalysis.actionableSentimentSummary.tone} (Score: {marketAnalysis.actionableSentimentSummary.score.toFixed(1)})
            </p>
            <p className="text-indigo-100 italic text-xs mt-1">{marketAnalysis.actionableSentimentSummary.interpretation}</p>
          </div>
        )}
          
      </div>
    </div>
  );
};

export default MarketAnalysisDisplay;
