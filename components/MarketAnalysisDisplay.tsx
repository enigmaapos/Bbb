// src/components/MarketAnalysisDisplay.tsx

import React from 'react';
import { SymbolData } from '../types'; // <-- UPDATED IMPORT (adjust path if types.ts is not in root)

// Define the types for the props that MarketAnalysisDisplay will receive
interface MarketAnalysisProps {
  marketAnalysis: {
    generalBias: {
      rating: string;
      interpretation: string;
      score: number;
    };
    fundingImbalance: {
      rating: string;
      interpretation: string;
      score: number;
    };
    shortSqueezeCandidates: {
      rating: string;
      interpretation: string;
      score: number;
    };
    longTrapCandidates: {
      rating: string;
      interpretation: string;
      score: number;
    };
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
  // We'll also need greenCount and redCount for the display, as they are part of the interpretation
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
        <p className={`text-sm ${marketAnalysis.generalBias.rating.includes('🔴') ? 'text-red-400' : marketAnalysis.generalBias.rating.includes('🟢') ? 'text-green-400' : marketAnalysis.generalBias.rating.includes('🟡') ? 'text-yellow-300' : 'text-gray-400'}`}>
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
        <p className={`text-sm ${marketAnalysis.fundingImbalance.rating.includes('🔴') ? 'text-red-400' : marketAnalysis.fundingImbalance.rating.includes('🟢') ? 'text-green-400' : 'text-gray-400'}`}>
          {marketAnalysis.fundingImbalance.rating} <span className="font-bold">({marketAnalysis.fundingImbalance.score.toFixed(1)}/10)</span>
        </p>
        <p className="text-xs italic text-gray-400">{marketAnalysis.fundingImbalance.interpretation}</p>
      </div>

      {/* Top Short Squeeze Candidates */}
      <div className="mb-4">
        <h3 className="text-yellow-400 font-semibold mb-1">🔥 Top Short Squeeze Candidates</h3>
        <p className={`text-sm ${marketAnalysis.shortSqueezeCandidates.rating.includes('🟢') ? 'text-green-400' : 'text-gray-400'}`}>
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
        <p className={`text-sm ${marketAnalysis.longTrapCandidates.rating.includes('🔴') ? 'text-red-400' : 'text-gray-400'}`}>
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
        <p className={`text-lg font-extrabold ${marketAnalysis.overallMarketOutlook.tone.includes('🔻') ? 'text-red-500' : marketAnalysis.overallMarketOutlook.tone.includes('🔺') ? 'text-green-500' : 'text-yellow-400'}`}>
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
