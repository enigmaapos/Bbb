// src/components/MarketAnalysisDisplay.tsx
import React from 'react';
import { MarketAnalysisResults, AggregatedLiquidationData } from '../types';
import { SymbolData } from '../types';

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

        {/* News Sentiment - NEW SECTION */}
        <div className="p-3 bg-gray-700/50 rounded-md col-span-full"> {/* Make it span full width if desired */}
          <h3 className="font-semibold text-orange-300 mb-1">📰 News Sentiment</h3>
          {marketAnalysis.newsSentiment && (
            <>
              <p className="text-orange-300">{marketAnalysis.newsSentiment.rating}</p>
              <p className="text-orange-200 text-xs mt-1">{marketAnalysis.newsSentiment.interpretation}</p>
              <p className={`text-right font-bold ${getScoreColor(marketAnalysis.newsSentiment.score)}`}>
                Score: {marketAnalysis.newsSentiment.score.toFixed(1)}
              </p>
            </>
          )}

          {/* Display actual news articles if available */}
          {marketAnalysis.newsData && marketAnalysis.newsData.length > 0 && (
            <div className="mt-3 text-xs">
              <p className="font-semibold text-orange-200 mb-1">Relevant Articles:</p>
              <ul className="list-disc list-inside text-gray-400 max-h-48 overflow-y-auto pr-2"> {/* Added max-height and scroll */}
                {marketAnalysis.newsData.map((article, index) => (
                  <li key={index} className="mb-1">
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      {article.title}
                    </a>
                    <br />
                    <span className="text-gray-500 italic">
                      {article.source} - {new Date(article.publishedAt).toLocaleDateString()}
                    </span>
                    <span className={`ml-2 text-sm font-semibold ${
                        article.sentimentCategory === 'positive' ? 'text-green-500' :
                        article.sentimentCategory === 'negative' ? 'text-red-500' :
                        'text-gray-400'
                    }`}>
                        ({article.sentimentCategory || 'N/A'})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Message if no news articles are found */}
          {marketAnalysis.newsData && marketAnalysis.newsData.length === 0 && (
            <p className="text-gray-400 text-xs mt-2">No recent news articles found for sentiment analysis.</p>
          )}
          {!marketAnalysis.newsSentiment && marketAnalysis.newsData === undefined && (
              <p className="text-gray-400 text-xs mt-2">News sentiment data is not available.</p>
          )}
        </div>

      </div> {/* End of grid */}
    </div>
  );
};

export default MarketAnalysisDisplay;
