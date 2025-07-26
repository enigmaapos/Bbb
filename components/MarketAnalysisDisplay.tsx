import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, } from 'recharts';
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

  const sentimentScores = [
    { name: 'Bias', score: marketAnalysis.generalBias.score },
    { name: 'Funding', score: marketAnalysis.fundingImbalance.score },
    { name: 'Squeeze', score: marketAnalysis.shortSqueezeCandidates.score },
    { name: 'Long Trap', score: marketAnalysis.longTrapCandidates.score },
    { name: 'Volume', score: marketAnalysis.volumeSentiment.score },
    { name: 'Liquidation', score: marketAnalysis.liquidationHeatmap.score },
    { name: 'News', score: marketAnalysis.newsSentiment.score },
  ];

  // Conditionally add 'Actionable' sentiment to the chart data if it exists
  if (marketAnalysis.actionableSentimentSummary) {
    sentimentScores.push({
      name: 'Actionable',
      score: marketAnalysis.actionableSentimentSummary.score
    });
  }

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

      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sentimentScores}>
            <XAxis dataKey="name" stroke="#ccc" />
            <YAxis domain={[0, 10]} stroke="#ccc" />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)}/10`} />
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
          <p className="text-blue-300">{marketAnalysis.generalBias.rating}</p>
          <p className="text-blue-200 text-xs mt-1">{marketAnalysis.generalBias.interpretation}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.generalBias.score)}`}>
            Score: {marketAnalysis.generalBias.score.toFixed(1)}
          </p>
        </div>

        {/* Funding Imbalance */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-yellow-300 mb-1">🕵️ Funding Imbalance</h3>
          <p className="text-yellow-200">{marketAnalysis.fundingImbalance.rating}</p>
          <p className="text-yellow-100 text-xs mt-1">
            {marketAnalysis.fundingImbalance.interpretation || "Funding rates are diverging — potential trap setup forming, monitor for confirmation before acting."}
          </p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.fundingImbalance.score)}`}>
            Score: {marketAnalysis.fundingImbalance.score.toFixed(1)}
          </p>
        </div>

        {/* Short Squeeze */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-green-300 mb-1">Short Squeeze Potential</h3>
          <p className="text-green-300">{marketAnalysis.shortSqueezeCandidates.rating}</p>
          <p className="text-green-200 text-xs mt-1">{marketAnalysis.shortSqueezeCandidates.interpretation}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.shortSqueezeCandidates.score)}`}>
            Score: {marketAnalysis.shortSqueezeCandidates.score.toFixed(1)}
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
          <p className="text-red-300">{marketAnalysis.longTrapCandidates.rating}</p>
          <p className="text-red-200 text-xs mt-1">{marketAnalysis.longTrapCandidates.interpretation}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.longTrapCandidates.score)}`}>
            Score: {marketAnalysis.longTrapCandidates.score.toFixed(1)}
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
          <p className="text-purple-300">{marketAnalysis.volumeSentiment.rating}</p>
          <p className="text-purple-200 text-xs mt-1">{marketAnalysis.volumeSentiment.interpretation}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.volumeSentiment.score)}`}>
            Score: {marketAnalysis.volumeSentiment.score.toFixed(1)}
          </p>
        </div>

        {/* Liquidation Heatmap */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-pink-300 mb-1">Liquidation Sentiment</h3>
          <p className="text-pink-300">{marketAnalysis.liquidationHeatmap.rating}</p>
          <p className="text-pink-200 text-xs mt-1">{marketAnalysis.liquidationHeatmap.interpretation}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.liquidationHeatmap.score)}`}>
            Score: {marketAnalysis.liquidationHeatmap.score.toFixed(1)}
          </p>
        </div>

        {/* News Sentiment */}
        <div className="p-3 bg-gray-700/50 rounded-md">
          <h3 className="font-semibold text-cyan-300 mb-1">📰 News Sentiment</h3>
          <p className="text-cyan-300">{marketAnalysis.newsSentiment.rating}</p>
          <p className="text-cyan-200 text-xs mt-1">{marketAnalysis.newsSentiment.interpretation}</p>
          <p className={`text-right font-bold ${getScoreColor(marketAnalysis.newsSentiment.score)}`}>
            Score: {marketAnalysis.newsSentiment.score.toFixed(1)}
          </p>
          {marketAnalysis.newsSentiment.topHeadlines && (
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

        {/* Actionable Sentiment Signals Summary - This remains a separate, detailed display block */}
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
