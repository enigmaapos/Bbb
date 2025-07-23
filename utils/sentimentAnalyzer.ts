// utils/sentimentAnalyzer.ts

import { MarketStats, MarketAnalysisResults, SentimentResult } from '../types';

export const analyzeSentiment = (marketStats: MarketStats): MarketAnalysisResults => {
  const { green, red, fundingStats, volumeData, liquidationData } = marketStats;

  const results: MarketAnalysisResults = {
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    speculativeInterest: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    momentumImbalance: { rating: "", interpretation: "", score: 0 },
    overallSentimentAccuracy: "High", // Default, can be dynamic later
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
  };

  // --- 1. General Market Bias ---
  if (green > red * 1.5) {
    results.generalBias = { rating: "Strongly Bullish", interpretation: "Significantly more assets are in positive territory.", score: 8.5 };
  } else if (green > red * 1.1) {
    results.generalBias = { rating: "Moderately Bullish", interpretation: "More assets are showing positive price action.", score: 7.0 };
  } else if (red > green * 1.5) {
    results.generalBias = { rating: "Strongly Bearish", interpretation: "A significant majority of assets are declining.", score: 3.0 };
  } else if (red > green * 1.1) {
    results.generalBias = { rating: "Moderately Bearish", interpretation: "More assets are showing negative price action.", score: 4.5 };
  } else {
    results.generalBias = { rating: "Neutral/Mixed", interpretation: "Market is balanced between gains and losses.", score: 5.5 };
  }


  // --- 2. Funding Sentiment Imbalance ---
  // We want to identify when shorts are paying (greenNegativeFunding)
  // or when longs are paying while price drops (redPositiveFunding).
  const { greenNegativeFunding, redPositiveFunding, greenFundingPositive, redNegativeFunding } = fundingStats; // Corrected destructuring

  const totalRelevantFunding = greenNegativeFunding + redPositiveFunding;
  const totalFundingMarkets = greenFundingPositive + greenNegativeFunding + redPositiveFunding + redNegativeFunding;

  if (totalRelevantFunding > 0) { // Avoid division by zero
    const shortSqueezePotentialRatio = greenNegativeFunding / totalRelevantFunding;
    const longTrapPotentialRatio = redPositiveFunding / totalRelevantFunding;

    if (shortSqueezePotentialRatio > 0.6) {
      results.fundingImbalance = {
        rating: "Bullish Skew (Short Squeeze)",
        interpretation: "A large number of tokens with positive price action have negative funding rates (shorts paying). This indicates potential short squeezes.",
        score: 8.0
      };
    } else if (longTrapPotentialRatio > 0.6) {
      results.fundingImbalance = {
        rating: "Bearish Skew (Long Trap)",
        interpretation: "Many tokens with negative price action have positive funding rates (longs paying). This suggests longs are trapped, potentially leading to cascading liquidations.",
        score: 3.0
      };
    } else if (shortSqueezePotentialRatio > 0.45) {
      results.fundingImbalance = {
        rating: "Slightly Bullish Skew",
        interpretation: "More tokens show shorts paying, contributing to a mild bullish tilt.",
        score: 6.5
      };
    } else if (longTrapPotentialRatio > 0.45) {
      results.fundingImbalance = {
        rating: "Slightly Bearish Skew",
        interpretation: "More tokens show longs paying during downtrends, indicating some trapped longs.",
        score: 4.0
      };
    } else {
      results.fundingImbalance = { rating: "Neutral Funding", interpretation: "Funding rates are relatively balanced.", score: 5.5 };
    }
  } else {
    results.fundingImbalance = { rating: "Neutral Funding", interpretation: "Insufficient data or balanced funding rates.", score: 5.0 };
  }


  // --- 3. Short Squeeze Candidates (Based on Price Up & Negative Funding) ---
  const shortSqueezeCandidatesCount = fundingStats.greenNegativeFunding; // Corrected usage
  if (shortSqueezeCandidatesCount > 15) { // Arbitrary threshold
    results.shortSqueezeCandidates = {
      rating: "High Probability of Short Squeeze",
      interpretation: `A significant number of assets (${shortSqueezeCandidatesCount}) are showing price increases while shorts are paying funding. This indicates strong bullish momentum and potential for further upward movement as shorts get squeezed.`,
      score: 9.0
    };
  } else if (shortSqueezeCandidatesCount > 5) {
    results.shortSqueezeCandidates = {
      rating: "Moderate Short Squeeze Potential",
      interpretation: `Some assets (${shortSqueezeCandidatesCount}) show conditions favorable for a short squeeze.`,
      score: 7.5
    };
  } else {
    results.shortSqueezeCandidates = {
      rating: "Low Short Squeeze Potential",
      interpretation: "Few assets are currently in a short squeeze setup.",
      score: 5.0
    };
  }

  // --- 4. Long Trap Candidates (Based on Price Down & Positive Funding) ---
  const longTrapCandidatesCount = fundingStats.redPositiveFunding;
  if (longTrapCandidatesCount > 15) { // Arbitrary threshold
    results.longTrapCandidates = {
      rating: "High Probability of Long Trap",
      interpretation: `A significant number of assets (${longTrapCandidatesCount}) are dropping in price while longs are paying funding. This suggests trapped longs and a high risk of further cascading liquidations.`,
      score: 2.0
    };
  } else if (longTrapCandidatesCount > 5) {
    results.longTrapCandidates = {
      rating: "Moderate Long Trap Potential",
      interpretation: `Some assets (${longTrapCandidatesCount}) show conditions where longs might be trapped.`,
      score: 3.5
    };
  } else {
    results.longTrapCandidates = {
      rating: "Low Long Trap Potential",
      interpretation: "Few assets are currently in a long trap setup.",
      score: 5.0
    };
  }

  // --- 5. Volume Sentiment ---
  // Analyze volume alongside price change
  const totalVolume = volumeData.reduce((sum, d) => sum + d.volume, 0);
  const upVolume = volumeData.filter(d => d.priceChange > 0).reduce((sum, d) => sum + d.volume, 0);
  const downVolume = volumeData.filter(d => d.priceChange < 0).reduce((sum, d) => sum + d.volume, 0);

  if (totalVolume === 0) {
    results.volumeSentiment = { rating: "Neutral", interpretation: "No significant volume data.", score: 5.0 };
  } else if (upVolume > downVolume * 1.5) {
    results.volumeSentiment = { rating: "Bullish Volume", interpretation: "Strong buying volume on up-trending assets.", score: 7.5 };
  } else if (downVolume > upVolume * 1.5) {
    results.volumeSentiment = { rating: "Bearish Volume", interpretation: "Strong selling volume on down-trending assets.", score: 3.0 };
  } else {
    results.volumeSentiment = { rating: "Mixed Volume", interpretation: "Volume is balanced between buying and selling.", score: 5.5 };
  }

  // --- 6. Speculative Interest (Open Interest) ---
  const totalOpenInterest = volumeData.reduce((sum, d) => sum + (d.openInterest || 0), 0);
  const avgOpenInterestPerSymbol = totalOpenInterest / volumeData.length;

  // Assuming a baseline or dynamic threshold for high/low OI.
  // For now, let's use a simple relative comparison or a fixed large number.
  // A more advanced approach would involve comparing to historical averages or total market cap.
  const highSpeculativeThreshold = 1_000_000_000; // Example: 1 Billion USD
  const mediumSpeculativeThreshold = 100_000_000; // Example: 100 Million USD

  if (totalOpenInterest > highSpeculativeThreshold) {
    results.speculativeInterest = {
      rating: "High Speculative Interest",
      interpretation: `Total Open Interest (${(totalOpenInterest / 1_000_000_000).toFixed(2)}B USD) indicates significant leverage and speculative activity. This can lead to exaggerated moves.`,
      score: 7.0
    };
  } else if (totalOpenInterest > mediumSpeculativeThreshold) {
    results.speculativeInterest = {
      rating: "Moderate Speculative Interest",
      interpretation: `Total Open Interest (${(totalOpenInterest / 1_000_000).toFixed(2)}M USD) suggests a healthy level of engagement.`,
      score: 5.5
    };
  } else {
    results.speculativeInterest = {
      rating: "Low Speculative Interest",
      interpretation: "Low Open Interest, possibly indicating less volatility or lower confidence.",
      score: 4.0
    };
  }

  // --- 7. Liquidation Heatmap Analysis ---
  if (liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD } = liquidationData;
    const totalLiquidations = totalLongLiquidationsUSD + totalShortLiquidationsUSD;

    if (totalLiquidations > 0) {
      const longLiquidationRatio = totalLongLiquidationsUSD / totalLiquidations;
      const shortLiquidationRatio = totalShortLiquidationsUSD / totalLiquidations;

      const significantLiquidationVolume = 5_000_000; // Example: 5 million USD in liquidations in the window

      if (totalLiquidations > significantLiquidationVolume) {
        if (longLiquidationRatio > 0.65) {
          results.liquidationHeatmap = {
            rating: "Significant Bearish Pressure (Long Liquidations)",
            interpretation: `High volume of long liquidations (${(totalLongLiquidationsUSD / 1_000_000).toFixed(2)}M USD) indicates trapped bullish positions, likely to fuel further price drops.`,
            score: 2.5
          };
        } else if (shortLiquidationRatio > 0.65) {
          results.liquidationHeatmap = {
            rating: "Significant Bullish Pressure (Short Liquidations)",
            interpretation: `High volume of short liquidations (${(totalShortLiquidationsUSD / 1_000_000).toFixed(2)}M USD) indicates trapped bearish positions, likely to fuel further price rallies.`,
            score: 8.5
          };
        } else {
          results.liquidationHeatmap = {
            rating: "Balanced Liquidation Activity",
            interpretation: "Liquidation volume is significant but relatively balanced between long and short closures, indicating two-way volatility.",
            score: 5.5
          };
        }
      } else {
        results.liquidationHeatmap = {
          rating: "Low Liquidation Activity",
          interpretation: "Current liquidation volume is low, suggesting less immediate forced market movement from liquidations.",
          score: 6.0
        };
      }
    } else {
      results.liquidationHeatmap = {
        rating: "No Recent Liquidations",
        interpretation: "No significant liquidation events detected in the recent window, implying no immediate liquidation-driven moves.",
        score: 5.0
      };
    }
  } else {
    results.liquidationHeatmap = {
      rating: "No Liquidation Data",
      interpretation: "Liquidation data is not available or not yet aggregated.",
      score: 5.0
    };
  }

  // --- 8. Momentum Imbalance (Price Change vs. RSI) ---
  // This is a simplified example. A real analysis would use more sophisticated RSI divergence/convergence.
  const overboughtCount = volumeData.filter(d => (d.rsi || 0) > 70 && d.priceChange > 0).length;
  const oversoldCount = volumeData.filter(d => (d.rsi || 0) < 30 && d.priceChange < 0).length;
  const bullishDivergenceCount = volumeData.filter(d => (d.rsi || 0) < 50 && d.priceChange < 0 && d.fundingRate < 0).length; // Price down, RSI low, shorts paying (potential hidden bullish)
  const bearishDivergenceCount = volumeData.filter(d => (d.rsi || 0) > 50 && d.priceChange > 0 && d.fundingRate > 0).length; // Price up, RSI high, longs paying (potential hidden bearish)

  if (overboughtCount > 5 && bearishDivergenceCount > 0) {
    results.momentumImbalance = {
      rating: "Potential Bearish Reversal",
      interpretation: `Several assets are overbought with positive price changes, and some show bearish divergence (price up, longs paying). Caution is advised for long positions.`,
      score: 3.0
    };
  } else if (oversoldCount > 5 && bullishDivergenceCount > 0) {
    results.momentumImbalance = {
      rating: "Potential Bullish Reversal",
      interpretation: `Several assets are oversold with negative price changes, and some show bullish divergence (price down, shorts paying). Look for potential reversal opportunities.`,
      score: 8.0
    };
  } else {
    results.momentumImbalance = {
      rating: "Neutral Momentum",
      interpretation: "Momentum indicators are not showing strong divergence or extremes across the market.",
      score: 5.5
    };
  }

  // --- Overall Market Outlook Score Calculation ---
  // A simple average of the individual scores. You can add weights if certain factors are more important.
  const scoresToAverage = [
    results.generalBias.score,
    results.fundingImbalance.score,
    results.shortSqueezeCandidates.score,
    results.longTrapCandidates.score,
    results.volumeSentiment.score,
    results.speculativeInterest.score,
    results.liquidationHeatmap.score,
    results.momentumImbalance.score,
  ];

  const validScores = scoresToAverage.filter(score => typeof score === 'number' && !isNaN(score));
  const averageScore = validScores.length > 0 ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;

  // Determine overall tone and strategy suggestion based on the average score
  let finalOutlookTone = "";
  let strategySuggestion = "";

  if (averageScore >= 8.0) {
    finalOutlookTone = "Strongly Bullish";
    strategySuggestion = "Aggressively seek long opportunities, especially on strong short squeeze candidates.";
  } else if (averageScore >= 7.0) {
    finalOutlookTone = "Mixed leaning Bullish";
    strategySuggestion = "Look for long opportunities on high-conviction setups, but be prepared for volatility and consider tighter stop losses.";
  } else if (averageScore >= 5.0) {
    finalOutlookTone = "Mixed/Neutral";
    strategySuggestion = "Focus on scalping or range trading specific high-volume symbols. Avoid strong directional bets until clarity emerges.";
  } else if (averageScore >= 3.0) {
    finalOutlookTone = "Bearish";
    strategySuggestion = "Consider shorting opportunities on long trap candidates, or staying on the sidelines. Exercise caution with long positions.";
  } else {
    finalOutlookTone = "Strongly Bearish";
    strategySuggestion = "Prioritize short positions and capital preservation. Avoid longs unless extremely compelling setups emerge.";
  }

  results.overallMarketOutlook = {
    score: parseFloat(averageScore.toFixed(1)),
    tone: finalOutlookTone,
    strategySuggestion: strategySuggestion,
  };

  return results;
};
