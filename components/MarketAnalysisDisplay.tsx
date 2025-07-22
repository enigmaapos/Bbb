// src/components/MarketAnalysisDisplay.tsx

import React from 'react';
import { SymbolData } from '../types';

// Define the types for the props that MarketAnalysisDisplay will receive
interface SentimentResult {
  rating: string;
  interpretation: string;
  score: number;
}

interface MarketAnalysisProps {
  marketAnalysis: {
    generalBias: SentimentResult;
    fundingImbalance: SentimentResult;
    shortSqueezeCandidates: SentimentResult;
    longTrapCandidates: SentimentResult;
    volumeSentiment: SentimentResult;
    speculativeInterest: SentimentResult; // NEW
    liquidationHeatmap: SentimentResult; // NEW
    momentumImbalance: SentimentResult; // NEW
    overallSentimentAccuracy: string;
    overallMarketOutlook: {
      score: number;
      tone: string;
      strategySuggestion: string;
    };
  };
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

// Helper function to format large numbers with M, B, T suffixes (copied from main component)
const formatVolume = (num: number): string => {
  if (num === 0) return "0";
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1, // Adjust as needed for precision
  });
  return formatter.format(num);
};

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
  // Helper to determine text color based on sentiment tone for consistency
  const getOutlookTextColor = (tone: string): string => {
    if (tone.includes('🟢 Strongly Bullish')) return 'text-green-500';
    if (tone.includes('🟡 Mixed leaning Bullish')) return 'text-yellow-400';
    if (tone.includes('↔️ Mixed/Neutral')) return 'text-blue-400';
    if (tone.includes('🔻 Bearish')) return 'text-red-500';
    return 'text-gray-400'; // Default
  };

  // Helper for general sentiment color (can be reused)
  const getSentimentColor = (rating: string): string => {
    if (rating.includes('🟢')) return 'text-green-400';
    if (rating.includes('🔴')) return 'text-red-400';
    if (rating.includes('🟡')) return 'text-yellow-300';
    if (rating.includes('↔️')) return 'text-blue-400'; // For neutral/mixed
    return 'text-gray-400';
  };

  return (
    <div className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md">
      <h2 className="text-lg font-bold text-white mb-3">📈 Detailed Market Analysis & Ratings</h2>

      {/* General Market Bias */}
      <div className="mb-4">
        <h3 className="text-blue-300 font-semibold mb-1">🧮 General Market Bias</h3>
        <p className="text-sm text-gray-300">
          <span className="font-bold">✅ Green:</span> {greenCount} &nbsp;&nbsp;
          <span className="font-bold">❌ Red:</span> {redCount}
        </p>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.generalBias.rating)}`}>
          {marketAnalysis.generalBias.rating} <span className="font-bold">({marketAnalysis.generalBias.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.generalBias.interpretation}</p>
      </div>

      {/* Funding Sentiment Imbalance */}
      <div className="mb-4">
        <h3 className="text-purple-300 font-semibold mb-1">📉 Funding Sentiment Imbalance</h3>
        <p className="text-sm text-gray-300">
          <span className="font-bold">Green Group (Price Up):</span> ➕ Longs Paying: {greenPositiveFunding}, ➖ Shorts Paying: {greenNegativeFunding}
        </p>
        <p className="text-sm text-gray-300">
          <span className="font-bold">Red Group (Price Down):</span> ➕ Longs Paying: {redPositiveFunding}, ➖ Shorts Paying: {redNegativeFunding}
        </p>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.fundingImbalance.rating)}`}>
          {marketAnalysis.fundingImbalance.rating} <span className="font-bold">({marketAnalysis.fundingImbalance.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.fundingImbalance.interpretation}</p>
      </div>

      {/* Overall Volume Sentiment */}
      <div className="mb-4">
        <h3 className="text-orange-300 font-semibold mb-1">📦 Overall Volume Sentiment</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.volumeSentiment.rating)}`}>
          {marketAnalysis.volumeSentiment.rating} <span className="font-bold">({marketAnalysis.volumeSentiment.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.volumeSentiment.interpretation}</p>
      </div>

      {/* NEW: Speculative Interest (Open Interest) */}
      <div className="mb-4">
        <h3 className="text-teal-300 font-semibold mb-1">🧠 Speculative Interest (OI)</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.speculativeInterest.rating)}`}>
          {marketAnalysis.speculativeInterest.rating} <span className="font-bold">({marketAnalysis.speculativeInterest.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.speculativeInterest.interpretation}</p>
      </div>

      {/* NEW: Momentum Imbalance (RSI) */}
      <div className="mb-4">
        <h3 className="text-cyan-300 font-semibold mb-1">📊 Momentum Imbalance (RSI)</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.momentumImbalance.rating)}`}>
          {marketAnalysis.momentumImbalance.rating} <span className="font-bold">({marketAnalysis.momentumImbalance.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.momentumImbalance.interpretation}</p>
      </div>

      {/* NEW: Liquidation Heatmap (Placeholder) */}
      <div className="mb-4">
        <h3 className="text-pink-500 font-semibold mb-1">💥 Liquidation Heatmap</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.liquidationHeatmap.rating)}`}>
          {marketAnalysis.liquidationHeatmap.rating} <span className="font-bold">({marketAnalysis.liquidationHeatmap.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.liquidationHeatmap.interpretation}</p>
      </div>

      {/* Top Short Squeeze Candidates */}
      <div className="mb-4">
        <h3 className="text-yellow-400 font-semibold mb-1">🔥 Top Short Squeeze Candidates</h3>
        <p className={`text-sm ${getSentimentColor(marketAnalysis.shortSqueezeCandidates.rating)}`}>
          {marketAnalysis.shortSqueezeCandidates.rating} <span className="font-bold">({marketAnalysis.shortSqueezeCandidates.score.toFixed(1)}/10)</span>
        </p>
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
        <p className={`text-sm ${getSentimentColor(marketAnalysis.longTrapCandidates.rating)}`}>
          {marketAnalysis.longTrapCandidates.rating} <span className="font-bold">({marketAnalysis.longTrapCandidates.score.toFixed(1)}/10)</span>
        </p>
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

      {/* Overall Sentiment Accuracy */}
      <div className="mb-4">
        <h3 className="text-cyan-300 font-semibold mb-1">🌐 Overall Sentiment Accuracy</h3>
        <p className={`text-sm ${marketAnalysis.overallSentimentAccuracy.includes('✅') ? 'text-green-400' : 'text-yellow-300'}`}>
          {marketAnalysis.overallSentimentAccuracy}
        </p>
      </div>

      {/* Final Market Outlook */}
      <div>
        <h3 className="text-white font-bold text-base mb-1">🏁 Final Market Outlook Score:</h3>
        <p className={`text-lg font-extrabold ${getOutlookTextColor(marketAnalysis.overallMarketOutlook.tone)}`}>
          {marketAnalysis.overallMarketOutlook.tone.split('—')[0]} <span className="ml-2">({marketAnalysis.overallMarketOutlook.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-sm italic text-gray-400">{marketAnalysis.overallMarketOutlook.tone.split('—')[1]?.trim()}</p>
        <p className="text-sm text-blue-300 mt-2">
          <span className="font-bold">📌 Strategy Suggestion:</span> {marketAnalysis.overallMarketOutlook.strategySuggestion}
        </p>
      </div>
    </div>
  );
};

export default MarketAnalysisDisplay;
