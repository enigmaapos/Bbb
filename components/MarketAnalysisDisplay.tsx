import React from 'react';
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
  const getScoreColor = (score: number) => {
    // Ensure score is a number before comparison
    if (typeof score !== 'number') return "text-gray-500"; // Fallback color if not a number
    if (score >= 7.5) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    if (score >= 4) return "text-orange-400";
    return "text-red-400";
  };

  const scoreToStars = (score: number) => {
    // Ensure score is a number before arithmetic operations
    const safeScore = typeof score === 'number' ? score : 0;
    const numStars = Math.round(safeScore / 2);
    // Ensure numStars is not negative in case of unexpected score values
    const clampedNumStars = Math.max(0, Math.min(5, numStars)); // Stars should be between 0 and 5
    return "⭐".repeat(clampedNumStars) + "☆".repeat(5 - clampedNumStars);
  };

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
        <span className={`${getScoreColor(marketAnalysis.overallMarketOutlook?.score || 0)} font-bold`}>
          {marketAnalysis.overallMarketOutlook?.tone || 'N/A'} (Score: {marketAnalysis.overallMarketOutlook?.score?.toFixed(1) || 'N/A'}/10){" "}
          {scoreToStars(marketAnalysis.overallMarketOutlook?.score || 0)}
        </span>
        <br />
        <span className="text-gray-400 italic text-xs ml-4">
          Strategy Suggestion: {marketAnalysis.overallMarketOutlook?.strategySuggestion || 'No suggestion available.'}
        </span>
      </p>

      ---

      <h3 className="text-lg font-semibold text-white mb-2 text-center">
        📊 Sentiment Scores Overview
      </h3>
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sentimentScores}>
            <XAxis
              dataKey="name"
              stroke="#ccc"
              tick={{ fill: '#ccc' }}
              label={{ value: 'Sentiment Category', position: 'insideBottom', offset: -5, fill: '#ccc' }}
            />
            <YAxis
              domain={[0, 10]}
              stroke="#ccc"
              tick={{ fill: '#ccc' }}
              label={{ value: 'Score (0-10)', angle: -90, position: 'insideLeft', offset: 10, fill: '#ccc' }}
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
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              content={<CustomLegend />}
            />
            <Bar dataKey="score">
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

      {/* Remember to apply the global CSS for tooltip background as discussed */}
      {/*
        // In your `globals.css` or equivalent global stylesheet:
        .recharts-tooltip-wrapper {
          background-color: #333 !important;
          border: 1px solid #555 !important;
          border-radius: 4px;
          box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.5);
          z-index: 1000;
        }

        .recharts-default-tooltip {
            background-color: #333;
            border: none;
            padding: 8px;
        }

        .recharts-tooltip-label {
            color: #fff;
        }
      */}

      ---

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        {/* General Bias */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-blue-300 mb-1">General Bias</h3>
          <p className="text-blue-300">{marketAnalysis.generalBias?.rating || 'N/A'}</p>
          <p className="text-blue-200 text-xs mt-1">{marketAnalysis.generalBias?.interpretation || 'No interpretation available.'}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.generalBias?.score || 0)}`}>
            Score: {marketAnalysis.generalBias?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* Funding Imbalance */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-yellow-300 mb-1">🕵️ Funding Imbalance</h3>
          <p className="text-yellow-200">{marketAnalysis.fundingImbalance?.rating || 'N/A'}</p>
          <p className="text-yellow-100 text-xs mt-1">
            {marketAnalysis.fundingImbalance?.interpretation || "Funding rates are diverging — potential trap setup forming, monitor for confirmation before acting."}
          </p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.fundingImbalance?.score || 0)}`}>
            Score: {marketAnalysis.fundingImbalance?.score?.toFixed(1) || 'N/A'}
          </p>
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

        {/* Volume Sentiment */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-purple-300 mb-1">Volume Sentiment</h3>
          <p className="text-purple-300">{marketAnalysis.volumeSentiment?.rating || 'N/A'}</p>
          <p className="text-purple-200 text-xs mt-1">{marketAnalysis.volumeSentiment?.interpretation || 'No interpretation available.'}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.volumeSentiment?.score || 0)}`}>
            Score: {marketAnalysis.volumeSentiment?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* Liquidation Heatmap */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-pink-300 mb-1">Liquidation Sentiment</h3>
          <p className="text-pink-300">{marketAnalysis.liquidationHeatmap?.rating || 'N/A'}</p>
          <p className="text-pink-200 text-xs mt-1">{marketAnalysis.liquidationHeatmap?.interpretation || 'No interpretation available.'}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.liquidationHeatmap?.score || 0)}`}>
            Score: {marketAnalysis.liquidationHeatmap?.score?.toFixed(1) || 'N/A'}
          </p>
        </div>

        {/* News Sentiment */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-cyan-300 mb-1">📰 News Sentiment</h3>
          <p className="text-cyan-300">{marketAnalysis.newsSentiment?.rating || 'N/A'}</p>
          <p className="text-cyan-200 text-xs mt-1">{marketAnalysis.newsSentiment?.interpretation || 'No interpretation available.'}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.newsSentiment?.score || 0)}`}>
            Score: {marketAnalysis.newsSentiment?.score?.toFixed(1) || 'N/A'}
          </p>
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
