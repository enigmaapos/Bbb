// components/MarketAnalysisDisplay.tsx
import React from 'react';
import { MarketAnalysisResults, FundingImbalanceData } from '../types';

interface MarketAnalysisDisplayProps {
  marketAnalysis: MarketAnalysisResults;
  fundingImbalanceData: FundingImbalanceData;
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
}) => {
  return (
    <div className="p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-md mb-8">
      <h2 className="text-2xl font-bold mb-4 text-blue-400">
        🧠 Advanced Market Sentiment Analysis
        <span
          className="text-sm text-gray-400 ml-2 cursor-help"
          title="Comprehensive analysis of various market factors to determine overall sentiment and potential trading opportunities."
        >
          ℹ️
        </span>
      </h2>

      {/* 🌐 Overall Market Outlook */}
      <div className="mb-6 p-4 bg-gray-700/50 rounded-md">
        <h3 className="text-xl font-semibold text-blue-300 mb-1">🌐 Overall Market Outlook</h3>
        <p
          className="text-lg font-bold"
          style={{
            color:
              marketAnalysis.overallMarketOutlook.score >= 8
                ? '#4CAF50'
                : marketAnalysis.overallMarketOutlook.score >= 7
                ? '#FFEB3B'
                : marketAnalysis.overallMarketOutlook.score >= 5
                ? '#9E9E9E'
                : '#EF5350',
          }}
        >
          {marketAnalysis.overallMarketOutlook.tone} (Score: {marketAnalysis.overallMarketOutlook.score}/10){' '}
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className={i < Math.round(marketAnalysis.overallMarketOutlook.score / 2) ? 'text-yellow-400' : 'text-gray-500'}
            >
              ⭐
            </span>
          ))}
        </p>
        <p className="text-sm text-gray-300 mt-2">
          📌 <span className="font-semibold">Strategy Suggestion:</span> {marketAnalysis.overallMarketOutlook.strategySuggestion}
        </p>
      </div>

      {/* 📊 Sentiment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderBlock("📊 General Bias", marketAnalysis.generalBias)}
        {renderBlock("💰 Funding Imbalance", marketAnalysis.fundingImbalance)}
        {renderBlockWithList("🚀 Short Squeeze Potential", marketAnalysis.shortSqueezeCandidates, fundingImbalanceData.topShortSqueeze)}
        {renderBlockWithList("⚠️ Long Trap Risk", marketAnalysis.longTrapCandidates, fundingImbalanceData.topLongTrap)}
        {renderBlock("📈 Volume Sentiment", marketAnalysis.volumeSentiment)}
        {renderBlock("🔥 Liquidation Sentiment", marketAnalysis.liquidationHeatmap)}
        {renderBlock("💎 High Quality Breakout", marketAnalysis.highQualityBreakout)}
        {renderBlock("🚩 Flagged Signal Sentiment", marketAnalysis.flaggedSignalSentiment)}
      </div>
    </div>
  );
};

export default MarketAnalysisDisplay;

// 🔧 Utilities (included below for single file)
const formatVolume = (num: number): string => {
  if (num === 0) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(num);
};

const getScoreColor = (score: number): string => {
  if (score >= 8) return "text-green-400";
  if (score >= 6.5) return "text-yellow-300";
  if (score >= 5) return "text-gray-300";
  return "text-red-400";
};

// 🧱 Reusable Block Without List
const renderBlock = (
  title: string,
  data: {
    rating: string;
    interpretation: string;
    score: number;
  }
) => {
  return (
    <div className="p-3 bg-gray-700/50 rounded-md">
      <h3 className="font-semibold text-blue-300 mb-1">{title}</h3>
      <p className="text-gray-300">{data.rating}</p>
      <p className="text-gray-400 text-xs mt-1">{data.interpretation}</p>
      <p className={`text-right font-bold ${getScoreColor(data.score)}`}>
        Score: {data.score.toFixed(1)}
      </p>
    </div>
  );
};

// 🧱 Reusable Block With List (e.g. Top Candidates)
const renderBlockWithList = (
  title: string,
  data: {
    rating: string;
    interpretation: string;
    score: number;
  },
  list: {
    symbol: string;
    priceChangePercent: number;
    fundingRate: number;
    volume: number;
  }[]
) => {
  return (
    <div className="p-3 bg-gray-700/50 rounded-md">
      <h3 className="font-semibold text-blue-300 mb-1">{title}</h3>
      <p className="text-gray-300">{data.rating}</p>
      <p className="text-gray-400 text-xs mt-1">{data.interpretation}</p>
      <p className={`text-right font-bold ${getScoreColor(data.score)}`}>
        Score: {data.score.toFixed(1)}
      </p>
      {list.length > 0 && (
        <div className="mt-2 text-xs text-gray-400">
          <p className="font-semibold text-white">Top Candidates:</p>
          <ul className="list-disc ml-4 space-y-1 mt-1">
            {list.map((s) => (
              <li key={s.symbol}>
                {s.symbol} — {s.priceChangePercent.toFixed(1)}% | {s.fundingRate.toFixed(4)}% | ${formatVolume(s.volume)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
