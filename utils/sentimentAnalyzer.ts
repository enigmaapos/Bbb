// utils/sentimentAnalyzer.ts

import {
  MarketStats,
  MarketAnalysisResults,
  MarketAnalysisResultDetail,
  SentimentArticle,
  AggregatedLiquidationData, // Make sure this is imported
  SymbolData, // Make sure this is imported if used in MarketData
} from "../types";

export const analyzeSentiment = (
  marketStats: MarketStats,
  newsArticles: SentimentArticle[] // Renamed for clarity within this function
): MarketAnalysisResults => {
  const {
    green,
    red,
    fundingStats,
    volumeData,
    liquidationData,
  } = marketStats;

  // Initialize sentiment scores
  let generalBiasScore = 0;
  let fundingImbalanceScore = 0;
  let shortSqueezeScore = 0;
  let longTrapScore = 0;
  let volumeSentimentScore = 0;
  let liquidationSentimentScore = 0;
  let newsSentimentScore = 0;

  // --- 1. General Market Bias Analysis ---
  let generalBiasRating = "";
  let generalBiasInterpretation = "";
  const totalSymbols = green + red;
  if (totalSymbols > 0) {
    const greenPercentage = (green / totalSymbols) * 100;
    if (greenPercentage >= 70) {
      generalBiasRating = "Strongly Bullish";
      generalBiasInterpretation = "A vast majority of pairs are showing positive 24h price change, indicating broad market strength.";
      generalBiasScore = 9;
    } else if (greenPercentage >= 55) {
      generalBiasRating = "Mildly Bullish";
      generalBiasInterpretation = "More pairs are up than down, suggesting a generally positive sentiment, but not overwhelmingly strong.";
      generalBiasScore = 7;
    } else if (greenPercentage <= 30) {
      generalBiasRating = "Strongly Bearish";
      generalBiasInterpretation = "A vast majority of pairs are showing negative 24h price change, indicating widespread weakness.";
      generalBiasScore = 2;
    } else if (greenPercentage <= 45) {
      generalBiasRating = "Mildly Bearish";
      generalBiasInterpretation = "More pairs are down than up, indicating a generally negative sentiment, but not a capitulation.";
      generalBiasScore = 4;
    } else {
      generalBiasRating = "Neutral/Mixed";
      generalBiasInterpretation = "The market is evenly split between positive and negative price changes, suggesting indecision.";
      generalBiasScore = 5;
    }
  }

  // --- 2. Funding Imbalance Analysis ---
  let fundingImbalanceRating = "";
  let fundingImbalanceInterpretation = "";

  const {
    greenPositiveFunding,
    greenNegativeFunding,
    redPositiveFunding,
    redNegativeFunding,
  } = fundingStats;

  const totalPositiveFunding = greenPositiveFunding + redPositiveFunding;
  const totalNegativeFunding = greenNegativeFunding + redNegativeFunding;

  if (totalPositiveFunding > totalNegativeFunding * 1.5) {
    fundingImbalanceRating = "Overly Bullish / Risky Longs";
    fundingImbalanceInterpretation = "Many longs are paying high funding, indicating potential for a long squeeze if price drops.";
    fundingImbalanceScore = 3;
  } else if (totalNegativeFunding > totalPositiveFunding * 1.5) {
    fundingImbalanceRating = "Overly Bearish / Short Squeeze Potential";
    fundingImbalanceInterpretation = "Many shorts are paying high funding, indicating potential for a short squeeze if price rises.";
    fundingImbalanceScore = 8;
  } else if (totalPositiveFunding > totalNegativeFunding) {
    fundingImbalanceRating = "Slightly Bullish Bias";
    fundingImbalanceInterpretation = "More longs are paying funding, indicating a slight bullish bias, but not extreme.";
    fundingImbalanceScore = 6;
  } else if (totalNegativeFunding > totalPositiveFunding) {
    fundingImbalanceRating = "Slightly Bearish Bias";
    fundingImbalanceInterpretation = "More shorts are paying funding, indicating a slight bearish bias, but not extreme.";
    fundingImbalanceScore = 5;
  } else {
    fundingImbalanceRating = "Neutral Funding";
    fundingImbalanceInterpretation = "Funding rates are relatively balanced, indicating no strong directional bias from perp funding.";
    fundingImbalanceScore = 5;
  }

  // --- 3. Short Squeeze Candidates Analysis ---
  let shortSqueezeCandidatesRating = "Low Potential";
  let shortSqueezeCandidatesInterpretation = "Few or no strong short squeeze candidates identified.";
  const topShortSqueezeCandidates = volumeData.filter(d => d.priceChange > 0 && d.fundingRate < 0).sort((a, b) => a.fundingRate - b.fundingRate).slice(0, 5);
  if (topShortSqueezeCandidates.length >= 3) {
    shortSqueezeCandidatesRating = "High Potential";
    shortSqueezeCandidatesInterpretation = "Several coins showing positive price action with negative funding, ripe for a short squeeze.";
    shortSqueezeScore = 8;
  } else if (topShortSqueezeCandidates.length > 0) {
    shortSqueezeCandidatesRating = "Moderate Potential";
    shortSqueezeCandidatesInterpretation = "A few coins exhibiting short squeeze conditions, worth monitoring.";
    shortSqueezeScore = 6;
  } else {
    shortSqueezeScore = 4;
  }

  // --- 4. Long Trap Candidates Analysis ---
  let longTrapCandidatesRating = "Low Risk";
  let longTrapCandidatesInterpretation = "Few or no strong long trap candidates identified.";
  const topLongTrapCandidates = volumeData.filter(d => d.priceChange < 0 && d.fundingRate > 0).sort((a, b) => b.fundingRate - a.fundingRate).slice(0, 5);
  if (topLongTrapCandidates.length >= 3) {
    longTrapCandidatesRating = "High Risk";
    longTrapCandidatesInterpretation = "Several coins showing negative price action with positive funding, indicating trapped longs and potential for further downside.";
    longTrapScore = 8;
  } else if (topLongTrapCandidates.length > 0) {
    longTrapCandidatesRating = "Moderate Risk";
    longTrapCandidatesInterpretation = "A few coins exhibiting long trap conditions, suggesting caution is advised for long positions.";
    longTrapScore = 6;
  } else {
    longTrapScore = 4;
  }

  // --- 5. Volume Sentiment Analysis (simplified) ---
  let volumeSentimentRating = "";
  let volumeSentimentInterpretation = "";
  const totalVolume = volumeData.reduce((sum, d) => sum + d.volume, 0);
  const totalVolumeUp = volumeData.filter(d => d.priceChange > 0).reduce((sum, d) => sum + d.volume, 0);
  const totalVolumeDown = volumeData.filter(d => d.priceChange < 0).reduce((sum, d) => sum + d.volume, 0);

  if (totalVolume > 0) {
    if (totalVolumeUp > totalVolumeDown * 1.5) {
      volumeSentimentRating = "Bullish Volume Confirmation";
      volumeSentimentInterpretation = "Higher volume on upward moving assets suggests strong buying interest.";
      volumeSentimentScore = 8;
    } else if (totalVolumeDown > totalVolumeUp * 1.5) {
      volumeSentimentRating = "Bearish Volume Confirmation";
      volumeSentimentInterpretation = "Higher volume on downward moving assets suggests strong selling pressure.";
      volumeSentimentScore = 3;
    } else {
      volumeSentimentRating = "Mixed Volume";
      volumeSentimentInterpretation = "Volume is distributed relatively evenly between up and down moving assets, indicating indecision.";
      volumeSentimentScore = 5;
    }
  } else {
    volumeSentimentRating = "Low Volume/Indeterminate";
    volumeSentimentInterpretation = "Insufficient volume data to determine strong sentiment.";
    volumeSentimentScore = 5;
  }

  // --- 6. Liquidation Heatmap Sentiment Analysis ---
  let liquidationHeatmapRating = "Neutral";
  let liquidationHeatmapInterpretation = "No significant imbalance in liquidations.";

  if (liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD } = liquidationData;

    if (totalLongLiquidationsUSD > totalShortLiquidationsUSD * 2) {
      liquidationHeatmapRating = "Bearish (Long Squeeze)";
      liquidationHeatmapInterpretation = `Significantly higher long liquidations ($${totalLongLiquidationsUSD.toFixed(2)} vs $${totalShortLiquidationsUSD.toFixed(2)}) indicate forced selling and potential for further downside.`;
      liquidationSentimentScore = 2;
    } else if (totalShortLiquidationsUSD > totalLongLiquidationsUSD * 2) {
      liquidationHeatmapRating = "Bullish (Short Squeeze)";
      liquidationHeatmapInterpretation = `Significantly higher short liquidations ($${totalShortLiquidationsUSD.toFixed(2)} vs $${totalLongLiquidationsUSD.toFixed(2)}) suggest bears are trapped, potentially fueling an upward move.`;
      liquidationSentimentScore = 9;
    } else if (totalLongLiquidationsUSD > totalShortLiquidationsUSD * 1.2) {
      liquidationHeatmapRating = "Slightly Bearish";
      liquidationHeatmapInterpretation = "More long liquidations than shorts, suggesting some downward pressure.";
      liquidationSentimentScore = 4;
    } else if (totalShortLiquidationsUSD > totalLongLiquidationsUSD * 1.2) {
      liquidationHeatmapRating = "Slightly Bullish";
      liquidationHeatmapInterpretation = "More short liquidations than longs, indicating some upward potential.";
      liquidationSentimentScore = 7;
    } else {
      liquidationHeatmapRating = "Balanced";
      liquidationHeatmapInterpretation = "Liquidations are relatively balanced, indicating no strong directional influence from forced closures.";
      liquidationSentimentScore = 5;
    }
  }

  // --- 7. News Sentiment Analysis (Basic example - can be expanded) ---
  let newsSentimentRating = "Neutral";
  let newsSentimentInterpretation = "No significant positive or negative news detected.";
  let positiveNewsCount = 0;
  let negativeNewsCount = 0;

  // This is a very basic sentiment analysis for news.
  // In a real application, you'd use NLP for more accurate sentiment.
  newsArticles.forEach(article => {
    const title = article.title.toLowerCase();
    if (title.includes("bullish") || title.includes("gain") || title.includes("rise") || title.includes("surge") || title.includes("breakout")) {
      positiveNewsCount++;
    }
    if (title.includes("bearish") || title.includes("fall") || title.includes("drop") || title.includes("crash") || title.includes("sell-off")) {
      negativeNewsCount++;
    }
  });

  if (positiveNewsCount > negativeNewsCount * 2) {
    newsSentimentRating = "Bullish News";
    newsSentimentInterpretation = "Recent news headlines are predominantly positive, likely supporting upward price action.";
    newsSentimentScore = 8;
  } else if (negativeNewsCount > positiveNewsCount * 2) {
    newsSentimentRating = "Bearish News";
    newsSentimentInterpretation = "Recent news headlines are predominantly negative, likely contributing to downward price action.";
    newsSentimentScore = 3;
  } else if (positiveNewsCount > negativeNewsCount) {
    newsSentimentRating = "Slightly Bullish News";
    newsSentimentInterpretation = "More positive news than negative, suggesting a mild positive sentiment from headlines.";
    newsSentimentScore = 6;
  } else if (negativeNewsCount > positiveNewsCount) {
    newsSentimentRating = "Slightly Bearish News";
    newsSentimentInterpretation = "More negative news than positive, suggesting a mild negative sentiment from headlines.";
    newsSentimentScore = 4;
  } else {
    newsSentimentRating = "Neutral News";
    newsSentimentInterpretation = "News sentiment is balanced or indecisive.";
    newsSentimentScore = 5;
  }


  // --- Overall Sentiment Accuracy (Placeholder, needs more sophisticated logic) ---
  let overallSentimentAccuracy = "Moderate Confidence"; // This would ideally be calculated based on signal consistency

  const results: MarketAnalysisResults = {
    generalBias: { rating: generalBiasRating, interpretation: generalBiasInterpretation, score: generalBiasScore },
    fundingImbalance: { rating: fundingImbalanceRating, interpretation: fundingImbalanceInterpretation, score: fundingImbalanceScore },
    shortSqueezeCandidates: { rating: shortSqueezeCandidatesRating, interpretation: shortSqueezeCandidatesInterpretation, score: shortSqueezeScore },
    longTrapCandidates: { rating: longTrapCandidatesRating, interpretation: longTrapCandidatesInterpretation, score: longTrapScore },
    volumeSentiment: { rating: volumeSentimentRating, interpretation: volumeSentimentInterpretation, score: volumeSentimentScore },
    liquidationHeatmap: { rating: liquidationHeatmapRating, interpretation: liquidationHeatmapInterpretation, score: liquidationSentimentScore },
    newsSentiment: { rating: newsSentimentRating, interpretation: newsSentimentInterpretation, score: newsSentimentScore },
    overallSentimentAccuracy: overallSentimentAccuracy,
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" }, // Will be calculated in index.tsx
    marketData: { // Populate marketData based on marketStats
      greenCount: green,
      redCount: red,
      greenPositiveFunding: fundingStats.greenPositiveFunding,
      greenNegativeFunding: fundingStats.greenNegativeFunding,
      redPositiveFunding: fundingStats.redPositiveFunding,
      redNegativeFunding: fundingStats.redNegativeFunding,
      priceUpFundingNegativeCount: volumeData.filter(d => d.priceChange > 0 && d.fundingRate < 0).length,
      priceDownFundingPositiveCount: volumeData.filter(d => d.priceChange < 0 && d.fundingRate > 0).length,
      topShortSqueeze: topShortSqueezeCandidates, // Use the calculated top candidates
      topLongTrap: topLongTrapCandidates,       // Use the calculated top candidates
      totalLongLiquidationsUSD: liquidationData?.totalLongLiquidationsUSD || 0,
      totalShortLiquidationsUSD: liquidationData?.totalShortLiquidationsUSD || 0,
    },
    newsData: newsArticles, // Pass newsArticles directly
  };

  return results;
};
