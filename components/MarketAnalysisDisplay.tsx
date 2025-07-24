// src/components/MarketAnalysisDisplay.tsx

import React from 'react';
import {
  SymbolData,
  MarketAnalysisResults,
} from '../types';

// Format volume like 25M, 2.1B, etc.
const formatVolume = (num: number): string => {
  if (num === 0) return '0';
  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return formatter.format(num);
};

interface MarketAnalysisProps {
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

const MarketAnalysisDisplay: React.FC<MarketAnalysisProps> = ({
  marketAnalysis,
  fundingImbalanceData,
  greenCount,
  redCount,
  greenPositiveFunding,
  greenNegativeFunding,
  redPositiveFunding,
  redNegativeFunding,
}) => {
  const getSentimentColor = (rating: string): string => {
    if (rating.includes('🟢')) return 'text-green-400';
    if (rating.includes('🔴')) return 'text-red-400';
    if (rating.includes('🟡')) return 'text-yellow-300';
    if (rating.includes('↔️')) return 'text-blue-400';
    if (rating.includes('💥')) return 'text-pink-400';
    return 'text-gray-300';
  };

  const getOutlookTextColor = (tone: string): string => {
    if (tone.includes('Strongly Bullish')) return 'text-green-400';
    if (tone.includes('Mixed')) return 'text-yellow-300';
    if (tone.includes('Bearish')) return 'text-red-400';
    return 'text-gray-300';
  };

  const isBullishTrapSqueeze =
    fundingImbalanceData.priceUpLongsPaying > 100 &&
    fundingImbalanceData.priceUpShortsPaying < 30;

  return (
    <div className="bg-gray-900 text-white rounded-lg p-6 border border-gray-700 space-y-6 shadow-md">
      <h2 className="text-2xl font-bold text-blue-300">🧠 Market Sentiment Intelligence</h2>

      {/* General Bias */}
      <div>
        <h3 className="text-blue-300 font-semibold mb-1">📊 General Bias</h3>
        <p className="text-sm text-gray-400">✅ Green: {greenCount} | ❌ Red: {redCount}</p>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.generalBias.rating)}`}>
          {marketAnalysis.generalBias.rating} ({marketAnalysis.generalBias.score.toFixed(1)}/10)
        </p>
        <p className="text-xs italic text-gray-500">{marketAnalysis.generalBias.interpretation}</p>
      </div>

      {/* Funding Imbalance */}
      <div>
        <h3 className="text-yellow-300 font-semibold mb-1">💰 Funding Imbalance</h3>
        <p className="text-sm text-gray-300">
          Green (Price Up): ➕ Longs Paying: {greenPositiveFunding}, ➖ Shorts Paying: {greenNegativeFunding}
        </p>
        <p className="text-sm text-gray-300">
          Red (Price Down): ➕ Longs Paying: {redPositiveFunding}, ➖ Shorts Paying: {redNegativeFunding}
        </p>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.fundingImbalance.rating)}`}>
          {marketAnalysis.fundingImbalance.rating} ({marketAnalysis.fundingImbalance.score.toFixed(1)}/10)
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.fundingImbalance.interpretation}</p>
      </div>

      {/* 🔥 Bullish Trap Squeeze Notice */}
      {isBullishTrapSqueeze && (
        <div className="bg-gray-800 border border-yellow-500 rounded-md p-4">
          <h3 className="text-yellow-400 font-semibold text-sm mb-2">📈 Bullish Trap Squeeze</h3>
          <p className="text-sm text-gray-200">
            Many longs are trapped (
            <span className="text-green-300 font-bold">{fundingImbalanceData.priceUpLongsPaying}</span> pairs),
            while only <span className="text-red-300 font-bold">{fundingImbalanceData.priceUpShortsPaying}</span> shorts
            are paying for rising prices. This suggests strong buying pressure and potential for a **short squeeze**.
          </p>
        </div>
      )}

      {/* Short Squeeze Candidates */}
      <div>
        <h3 className="text-green-300 font-semibold mb-1">🚀 Short Squeeze Candidates</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.shortSqueezeCandidates.rating)}`}>
          {marketAnalysis.shortSqueezeCandidates.rating} ({marketAnalysis.shortSqueezeCandidates.score.toFixed(1)}/10)
        </p>
        <p className="text-xs italic text-gray-400 mb-2">{marketAnalysis.shortSqueezeCandidates.interpretation}</p>
        {fundingImbalanceData.topShortSqueeze.length > 0 ? (
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
            {fundingImbalanceData.topShortSqueeze.map((s) => (
              <li key={s.symbol}>
                <strong>{s.symbol}</strong> — Price: {s.priceChangePercent.toFixed(1)}% | Funding:{' '}
                {(s.fundingRate * 100).toFixed(3)}% | Volume: {formatVolume(s.volume)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500 italic">No strong short squeeze setups.</p>
        )}
      </div>

      {/* Long Trap Candidates */}
      <div>
        <h3 className="text-red-300 font-semibold mb-1">⚠️ Long Trap Risk</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.longTrapCandidates.rating)}`}>
          {marketAnalysis.longTrapCandidates.rating} ({marketAnalysis.longTrapCandidates.score.toFixed(1)}/10)
        </p>
        <p className="text-xs italic text-gray-400 mb-2">{marketAnalysis.longTrapCandidates.interpretation}</p>
        {fundingImbalanceData.topLongTrap.length > 0 ? (
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
            {fundingImbalanceData.topLongTrap.map((s) => (
              <li key={s.symbol}>
                <strong>{s.symbol}</strong> — Price: {s.priceChangePercent.toFixed(1)}% | Funding:{' '}
                {(s.fundingRate * 100).toFixed(3)}% | Volume: {formatVolume(s.volume)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500 italic">No long trap risks detected.</p>
        )}
      </div>

      {/* Volume Sentiment */}
      <div>
        <h3 className="text-purple-300 font-semibold mb-1">📦 Volume Sentiment</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.volumeSentiment.rating)}`}>
          {marketAnalysis.volumeSentiment.rating} ({marketAnalysis.volumeSentiment.score.toFixed(1)}/10)
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.volumeSentiment.interpretation}</p>
      </div>

      {/* Liquidation Heatmap */}
      <div>
        <h3 className="text-pink-400 font-semibold mb-1">💥 Liquidation Sentiment</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.liquidationHeatmap.rating)}`}>
          {marketAnalysis.liquidationHeatmap.rating} ({marketAnalysis.liquidationHeatmap.score.toFixed(1)}/10)
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.liquidationHeatmap.interpretation}</p>
      </div>

      {/* Final Outlook */}
      <div className="pt-4 border-t border-gray-600">
        <h3 className="text-white font-semibold text-base">🏁 Final Market Outlook</h3>
        <p className={`text-lg font-bold ${getOutlookTextColor(marketAnalysis.overallMarketOutlook.tone)}`}>
          {marketAnalysis.overallMarketOutlook.tone.split('—')[0]} ({marketAnalysis.overallMarketOutlook.score.toFixed(1)}/10)
        </p>
        <p className="text-sm italic text-gray-400">
          {marketAnalysis.overallMarketOutlook.tone.split('—')[1]}
        </p>
        <p className="text-sm mt-2 text-blue-300">
          📌 <span className="font-bold">Strategy:</span> {marketAnalysis.overallMarketOutlook.strategySuggestion}
        </p>
      </div>
    </div>
  );
};

export default MarketAnalysisDisplay;
