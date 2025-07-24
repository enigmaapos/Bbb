// src/utils/sentimentAnalyzer.ts

import { MarketStats, MarketAnalysisResults, SentimentRating } from '../types';

export function analyzeSentiment(data: MarketStats): MarketAnalysisResults {
  const {
    green,
    red,
    fundingStats,
    volumeData,
    liquidationData,
  } = data;

  const results: MarketAnalysisResults = {
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    // *** THIS IS THE MISSING LINE ***
    highQualityBreakout: { rating: "", interpretation: "", score: 0 },
    // *******************************
    overallSentimentAccuracy: "", // This will be calculated later in index.tsx
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" }, // This will be calculated later in index.tsx
  };

  // 1. General Market Bias
  if (green > red * 1.5) {
    results.generalBias = {
      rating: "Strongly Bullish",
      interpretation: "Significantly more assets are showing positive price action, indicating strong overall buying pressure.",
      score: 9,
    };
  } else if (green > red) {
    results.generalBias = {
      rating: "Mildly Bullish",
      interpretation: "More assets are green than red, suggesting a bullish sentiment, but not overwhelmingly so.",
      score: 7,
    };
  } else if (red > green * 1.5) {
    results.generalBias = {
      rating: "Strongly Bearish",
      interpretation: "A large majority of assets are red, pointing to significant selling pressure and bearish sentiment.",
      score: 2,
    };
  } else if (red > green) {
    results.generalBias = {
      rating: "Mildly Bearish",
      interpretation: "More assets are red than green, indicating a bearish lean, but the market isn't collapsing.",
      score: 4,
    };
  } else {
    results.generalBias = {
      rating: "Neutral/Mixed",
      interpretation: "An almost equal number of green and red assets, suggesting market indecision or consolidation.",
      score: 5,
    };
  }

  // 2. Funding Imbalance (Short Squeeze vs. Long Trap Potential)
  const { greenPositiveFunding, greenNegativeFunding, redPositiveFunding, redNegativeFunding } = fundingStats;

  // Bullish signals from funding
  const bullishFundingScore = greenNegativeFunding * 2 + redNegativeFunding; // Green price, shorts paying + Red price, shorts paying
  // Bearish signals from funding
  const bearishFundingScore = redPositiveFunding * 2 + greenPositiveFunding; // Red price, longs paying + Green price, longs paying

  if (bullishFundingScore > bearishFundingScore * 1.5) {
    results.fundingImbalance = {
      rating: "Bullish Funding Imbalance",
      interpretation: "Significantly more shorts are paying, especially on rising assets, indicating potential short squeezes.",
      score: 8,
    };
  } else if (bullishFundingScore > bearishFundingScore) {
    results.fundingImbalance = {
      rating: "Slight Bullish Funding Imbalance",
      interpretation: "A lean towards shorts paying, suggesting some underlying bullish pressure from funding.",
      score: 6,
    };
  } else if (bearishFundingScore > bullishFundingScore * 1.5) {
    results.fundingImbalance = {
      rating: "Bearish Funding Imbalance",
      interpretation: "A large number of longs are paying, especially on falling assets, indicating significant long trap potential.",
      score: 3,
    };
  } else if (bearishFundingScore > bullishFundingScore) {
    results.fundingImbalance = {
      rating: "Slight Bearish Funding Imbalance",
      interpretation: "A lean towards longs paying, suggesting some underlying bearish pressure from funding.",
      score: 4,
    };
  } else {
    results.fundingImbalance = {
      rating: "Balanced Funding",
      interpretation: "Funding rates are relatively balanced, no strong directional bias from this metric.",
      score: 5,
    };
  }

  // 3. Short Squeeze Candidates (price up, funding negative)
  const shortSqueezeCandidates = volumeData.filter(d => d.priceChange > 0 && d.fundingRate < 0);
  if (shortSqueezeCandidates.length > 20) {
    results.shortSqueezeCandidates = {
      rating: "High Squeeze Potential",
      interpretation: "Many assets are rallying despite negative funding, suggesting shorts are trapped and fueling upside.",
      score: 9,
    };
  } else if (shortSqueezeCandidates.length > 10) {
    results.shortSqueezeCandidates = {
      rating: "Moderate Squeeze Potential",
      interpretation: "A fair number of assets are showing short squeeze setups.",
      score: 7,
    };
  } else {
    results.shortSqueezeCandidates = {
      rating: "Low Squeeze Potential",
      interpretation: "Few assets exhibit strong short squeeze characteristics.",
      score: 5,
    };
  }

  // 4. Long Trap Candidates (price down, funding positive)
  const longTrapCandidates = volumeData.filter(d => d.priceChange < 0 && d.fundingRate > 0);
  if (longTrapCandidates.length > 20) {
    results.longTrapCandidates = {
      rating: "High Long Trap Risk",
      interpretation: "Many assets are falling with positive funding, indicating trapped longs and potential for cascades.",
      score: 2,
    };
  } else if (longTrapCandidates.length > 10) {
    results.longTrapCandidates = {
      rating: "Moderate Long Trap Risk",
      interpretation: "A fair number of assets are showing long trap setups.",
      score: 4,
    };
  } else {
    results.longTrapCandidates = {
      rating: "Low Long Trap Risk",
      interpretation: "Few assets exhibit strong long trap characteristics.",
      score: 6, // Higher score as low risk is good
    };
  }

  // 5. Volume Sentiment
  const highVolumeGainers = volumeData.filter(d => d.priceChange > 5 && d.volume > 50_000_000);
  const highVolumeLosers = volumeData.filter(d => d.priceChange < -5 && d.volume > 50_000_000);

  if (highVolumeGainers.length > highVolumeLosers.length * 1.5) {
    results.volumeSentiment = {
      rating: "Bullish Volume",
      interpretation: "Significant capital is flowing into rallying assets, confirming uptrends.",
      score: 8,
    };
  } else if (highVolumeLosers.length > highVolumeGainers.length * 1.5) {
    results.volumeSentiment = {
      rating: "Bearish Volume",
      interpretation: "Heavy selling volume on declining assets, confirming downtrends and capitulation.",
      score: 3,
    };
  } else {
    results.volumeSentiment = {
      rating: "Mixed Volume",
      interpretation: "Volume is distributed, no clear directional signal from high-volume moves.",
      score: 5,
    };
  }

  // 6. Liquidation Heatmap (if data is available)
  if (liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD } = liquidationData;

    if (totalLongLiquidationsUSD > totalShortLiquidationsUSD * 2) {
      results.liquidationHeatmap = {
        rating: "Dominant Long Liquidations",
        interpretation: "Overwhelming long liquidations suggest a strong bearish push or cascading sell-offs.",
        score: 2,
      };
    } else if (totalShortLiquidationsUSD > totalLongLiquidationsUSD * 2) {
      results.liquidationHeatmap = {
        rating: "Dominant Short Liquidations",
        interpretation: "Significant short liquidations indicate strong upward price movements and short squeezes.",
        score: 9,
      };
    } else if (totalLongLiquidationsUSD > totalShortLiquidationsUSD * 1.2) {
      results.liquidationHeatmap = {
        rating: "Long Liquidations Present",
        interpretation: "More long liquidations, contributing to bearish pressure.",
        score: 4,
      };
    } else if (totalShortLiquidationsUSD > totalLongLiquidationsUSD * 1.2) {
      results.liquidationHeatmap = {
        rating: "Short Liquidations Present",
        interpretation: "More short liquidations, contributing to bullish pressure.",
        score: 7,
      };
    } else {
      results.liquidationHeatmap = {
        rating: "Balanced Liquidations",
        interpretation: "Relatively equal long and short liquidations, no strong bias.",
        score: 6,
      };
    }
  } else {
    results.liquidationHeatmap = {
      rating: "No Data",
      interpretation: "Liquidation data is not available to assess heatmap sentiment.",
      score: 5, // Neutral score if data is missing
    };
  }

  // 7. High-Quality Breakout Analysis (Based on Flagged Signals)
  // This depends on the `detectSentimentSignals` output, which is consumed by `index.tsx`
  // For `sentimentAnalyzer.ts`, we can infer this based on general market conditions
  // and the count of strong signals.

  const strongBullishSignals = volumeData.filter(d =>
    d.priceChange >= 10 && d.volume >= 50_000_000 && d.fundingRate <= 0.0001
  ).length;

  const strongBearishSignals = volumeData.filter(d =>
    d.priceChange <= -10 && d.volume >= 50_000_000 && d.fundingRate >= 0.0001
  ).length;

  if (strongBullishSignals > strongBearishSignals * 1.5 && strongBullishSignals > 3) {
    results.highQualityBreakout = {
      rating: "High Bullish Breakout Potential",
      interpretation: "Several assets are showing strong breakout characteristics with high volume and favorable funding, suggesting significant upside.",
      score: 9,
    };
  } else if (strongBullishSignals > strongBearishSignals && strongBullishSignals > 1) {
    results.highQualityBreakout = {
      rating: "Moderate Bullish Breakout Potential",
      interpretation: "A few assets are showing promising bullish breakout setups.",
      score: 7,
    };
  } else if (strongBearishSignals > strongBullishSignals * 1.5 && strongBearishSignals > 3) {
    results.highQualityBreakout = {
      rating: "High Bearish Breakout Potential", // "Breakout" here means breaking down
      interpretation: "Multiple assets are exhibiting strong bearish breakdown signals with high volume and trapped longs, indicating further downside.",
      score: 2,
    };
  } else if (strongBearishSignals > strongBullishSignals && strongBearishSignals > 1) {
    results.highQualityBreakout = {
      rating: "Moderate Bearish Breakout Potential",
      interpretation: "A few assets are showing concerning bearish breakdown setups.",
      score: 4,
    };
  } else {
    results.highQualityBreakout = {
      rating: "Mixed/Low Breakout Activity",
      interpretation: "No clear trend in high-quality breakouts or breakdowns across the market.",
      score: 5,
    };
  }

  // Overall sentiment accuracy (this can be a simple placeholder or more complex if needed)
  results.overallSentimentAccuracy = "Based on real-time Binance data.";

  // Overall Market Outlook (calculated in index.tsx based on averaged scores)
  // This function only prepares the individual component scores.

  return results;
}
