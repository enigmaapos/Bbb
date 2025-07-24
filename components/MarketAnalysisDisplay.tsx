// components/MarketAnalysisDisplay.tsx
import React from 'react';
import { MarketAnalysisResults, FundingImbalanceData } from '../types'; // Ensure SentimentRating is imported if used directly

interface MarketAnalysisDisplayProps {
  marketAnalysis: MarketAnalysisResults;
  fundingImbalanceData: FundingImbalanceData; // Assuming this is also passed
  // ... other props if any
  greenCount: number;
  redCount: number;
  greenPositiveFunding: number;
  greenNegativeFunding: number;
  redPositiveFunding: number;
  redNegativeFunding: number;
}

const MarketAnalysisDisplay: React.FC<MarketAnalysisDisplayProps> = ({
  marketAnalysis,
  fundingImbalanceData,
  // ... destructure other props
  greenCount,
  redCount,
  greenPositiveFunding,
  greenNegativeFunding,
  redPositiveFunding,
  redNegativeFunding,
}) => {
  return (
    <div className="p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md mb-8">
      <h2 className="text-2xl font-bold mb-4 text-blue-400">🧠 Advanced Market Sentiment Analysis<span className="text-sm text-gray-400 ml-2 cursor-help" title="Comprehensive analysis of various market factors to determine overall sentiment and potential trading opportunities.">ℹ️</span></h2>

      {/* Overall Market Outlook */}
      <div className="mb-6 p-4 bg-gray-700 rounded-lg">
        <h3 className="text-xl font-semibold text-white mb-2">🌐 Overall Market Outlook:</h3>
        <p className="text-lg font-bold" style={{ color: marketAnalysis.overallMarketOutlook.score >= 8 ? '#4CAF50' : marketAnalysis.overallMarketOutlook.score >= 7 ? '#FFEB3B' : marketAnalysis.overallMarketOutlook.score >= 5 ? '#9E9E9E' : '#EF5350' }}>
          {marketAnalysis.overallMarketOutlook.tone} (Score: {marketAnalysis.overallMarketOutlook.score}/10)
          {' '}
          {/* Star rating logic */}
          {[...Array(5)].map((_, i) => (
            <span key={i} className={i < Math.round(marketAnalysis.overallMarketOutlook.score / 2) ? 'text-yellow-400' : 'text-gray-500'}>
              ⭐
            </span>
          ))}
        </p>
        <p className="text-sm text-gray-300 mt-2">Strategy Suggestion: {marketAnalysis.overallMarketOutlook.strategySuggestion}</p>
      </div>

      {/* Sentiment Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* General Bias */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">General Bias</h3>
          <p className="text-md text-gray-300">{marketAnalysis.generalBias.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.generalBias.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.generalBias.score.toFixed(1)}</p>
        </div>

        {/* Funding Imbalance */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">Funding Imbalance</h3>
          <p className="text-md text-gray-300">{marketAnalysis.fundingImbalance.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.fundingImbalance.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.fundingImbalance.score.toFixed(1)}</p>
        </div>

        {/* Short Squeeze Potential */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">Short Squeeze Potential</h3>
          <p className="text-md text-gray-300">{marketAnalysis.shortSqueezeCandidates.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.shortSqueezeCandidates.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.shortSqueezeCandidates.score.toFixed(1)}</p>
          {fundingImbalanceData.topShortSqueeze.length > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              <p className="font-semibold text-white">Top Candidates:</p>
              <ul className="list-disc ml-4">
                {fundingImbalanceData.topShortSqueeze.map((s) => (
                  <li key={s.symbol}>{s.symbol} ({s.priceChangePercent.toFixed(1)}% | {s.fundingRate.toFixed(4)}% | ${formatVolume(s.volume)})</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Long Trap Risk */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">Long Trap Risk</h3>
          <p className="text-md text-gray-300">{marketAnalysis.longTrapCandidates.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.longTrapCandidates.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.longTrapCandidates.score.toFixed(1)}</p>
          {fundingImbalanceData.topLongTrap.length > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              <p className="font-semibold text-white">Top Candidates:</p>
              <ul className="list-disc ml-4">
                {fundingImbalanceData.topLongTrap.map((s) => (
                  <li key={s.symbol}>{s.symbol} ({s.priceChangePercent.toFixed(1)}% | {s.fundingRate.toFixed(4)}% | ${formatVolume(s.volume)})</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Volume Sentiment */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">Volume Sentiment</h3>
          <p className="text-md text-gray-300">{marketAnalysis.volumeSentiment.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.volumeSentiment.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.volumeSentiment.score.toFixed(1)}</p>
        </div>

        {/* Liquidation Sentiment */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">Liquidation Sentiment</h3>
          <p className="text-md text-gray-300">{marketAnalysis.liquidationHeatmap.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.liquidationHeatmap.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.liquidationHeatmap.score.toFixed(1)}</p>
        </div>

        {/* High Quality Breakout (If you have logic for this) */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">High Quality Breakout</h3>
          <p className="text-md text-gray-300">{marketAnalysis.highQualityBreakout.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.highQualityBreakout.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.highQualityBreakout.score.toFixed(1)}</p>
        </div>

        {/* NEW: Flagged Signal Sentiment */}
        <div className="p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white">Flagged Signal Sentiment</h3>
          <p className="text-md text-gray-300">{marketAnalysis.flaggedSignalSentiment.rating}</p>
          <p className="text-sm text-gray-400">{marketAnalysis.flaggedSignalSentiment.interpretation}</p>
          <p className="text-xs text-blue-300">Score: {marketAnalysis.flaggedSignalSentiment.score.toFixed(1)}</p>
        </div>

      </div> {/* End Sentiment Categories Grid */}

    </div>
  );
};

export default MarketAnalysisDisplay;

// You will also need to ensure formatVolume is available or passed as a prop if used here.
// For simplicity, you can define it within this component or import it if it's a shared utility.
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
