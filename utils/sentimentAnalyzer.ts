// utils/sentimentAnalyzer.ts

// ... (previous code)

export const analyzeSentiment = (stats: MarketStats): MarketAnalysisResults => {
  // Initialize all sentiment ratings
  const defaultSentiment: SentimentRating = { rating: "Neutral", interpretation: "No clear bias.", score: 5.0 };

  let generalBias: SentimentRating = { ...defaultSentiment };
  let fundingImbalance: SentimentRating = { ...defaultSentiment };
  let shortSqueezeCandidates: SentimentRating = { ...defaultSentiment };
  let longTrapCandidates: SentimentRating = { ...defaultSentiment };
  let volumeSentiment: SentimentRating = { ...defaultSentiment };
  let liquidationHeatmap: SentimentRating = { ...defaultSentiment };
  let highQualityBreakout: SentimentRating = { ...defaultSentiment };
  let flaggedSignalSentiment: SentimentRating = { ...defaultSentiment };

  // --- General Bias ---
  // ... (existing General Bias logic) ...


  // --- Funding Imbalance ---
  // FIX: Access properties through stats.fundingStats
  const totalPositiveFunding = stats.fundingStats.greenPositiveFunding + stats.fundingStats.redPositiveFunding;
  const totalNegativeFunding = stats.fundingStats.greenNegativeFunding + stats.fundingStats.redNegativeFunding;

  if (totalPositiveFunding > totalNegativeFunding * 2) {
    fundingImbalance = {
      rating: "Strong Bearish Funding Imbalance",
      interpretation: "A very large number of longs are paying, especially on falling assets, indicating extreme long trap potential.",
      score: 2.0,
    };
  } else if (totalPositiveFunding > totalNegativeFunding * 1.2) {
    fundingImbalance = {
      rating: "Bearish Funding Imbalance",
      interpretation: "A large number of longs are paying, especially on falling assets, indicating significant long trap potential.",
      score: 3.0,
    };
  } else if (totalNegativeFunding > totalPositiveFunding * 2) {
    fundingImbalance = {
      rating: "Strong Bullish Funding Imbalance",
      interpretation: "A very large number of shorts are paying, especially on rising assets, indicating extreme short squeeze potential.",
      score: 8.0,
    };
  } else if (totalNegativeFunding > totalPositiveFunding * 1.2) {
    fundingImbalance = {
      rating: "Bullish Funding Imbalance",
      interpretation: "A large number of shorts are paying, especially on rising assets, indicating significant short squeeze potential.",
      score: 7.0,
    };
  }

  // --- Short Squeeze Candidates ---
  // FIX: Access properties through stats.fundingStats
  const shortSqueezeCount = stats.fundingStats.greenNegativeFunding; // Or, better: count from a pre-filtered list passed in stats
  if (shortSqueezeCount > 15) { // Example threshold
    shortSqueezeCandidates = {
      rating: "High Squeeze Potential",
      interpretation: "A significant number of assets are showing strong short squeeze setups, where price is rising and shorts are paying heavily.",
      score: 8.5,
    };
  } else if (shortSqueezeCount > 5) {
    shortSqueezeCandidates = {
      rating: "Moderate Squeeze Potential",
      interpretation: "A fair number of assets are showing short squeeze setups.",
      score: 7.0,
    };
  } else if (shortSqueezeCount > 0) {
    shortSqueezeCandidates = {
      rating: "Low Squeeze Potential",
      interpretation: "Few assets currently meet the criteria for short squeeze setups.",
      score: 5.5,
    };
  } else {
    shortSqueezeCandidates = {
      rating: "No Clear Squeeze Potential",
      interpretation: "No assets currently meet the criteria for short squeeze setups.",
      score: 4.0,
    };
  }

  // --- Long Trap Risk ---
  // FIX: Access properties through stats.fundingStats
  const longTrapCount = stats.fundingStats.redPositiveFunding; // Or, better: count from a pre-filtered list passed in stats
  if (longTrapCount > 15) { // Example threshold
    longTrapCandidates = {
      rating: "High Long Trap Risk",
      interpretation: "Many assets are falling with positive funding, indicating trapped longs and potential for cascades.",
      score: 2.0,
    };
  } else if (longTrapCount > 5) {
    longTrapCandidates = {
      rating: "Moderate Long Trap Risk",
      interpretation: "Some assets are showing long trap characteristics, proceed with caution.",
      score: 3.5,
    };
  } else if (longTrapCount > 0) {
    longTrapCandidates = {
      rating: "Low Long Trap Risk",
      interpretation: "Few assets are currently showing strong long trap characteristics.",
      score: 6.0,
    };
  } else {
    longTrapCandidates = {
      rating: "No Significant Long Trap Risk",
      interpretation: "No assets are currently showing significant long trap characteristics.",
      score: 7.5,
    };
  }

  // ... (rest of the code) ...
