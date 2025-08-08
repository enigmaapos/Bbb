// pages/index.tsx

import Head from 'next/head';
import Image from 'next/image';
import { Inter } from 'next/font/google';
import styles from '@/styles/Home.module.css';
import {
  // REMOVED: SentimentAnalysis is not an exported member of sentimentAnalyzer.ts
  getMarketData,
  MarketStats,
  analyzeSentiment,
  MarketAnalysisResults,
} from '../utils/sentimentAnalyzer';
import React, { useEffect, useState } from 'react';
import MarketAnalysisDisplay from '../components/MarketAnalysisDisplay';
import { fetchAggregatedLiquidationData } from '../utils/binanceApi';
import { NewsData, SentimentArticle } from '../types';
import { getNewsSentiment } from '../utils/newsSentiment';
import SiteADataLoader from '../components/SiteADataLoader';
import { SiteAData } from '../types';

const inter = Inter({ subsets: ['latin'] });

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [siteAData, setSiteAData] = useState<SiteAData | null>(null);

  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResults>({
    generalBias: { rating: '', interpretation: '', score: 0 },
    fundingImbalance: { rating: '', interpretation: '', score: 0 },
    shortSqueezeCandidates: { rating: '', interpretation: '', score: 0 },
    longTrapCandidates: { rating: '', interpretation: '', score: 0 },
    volumeSentiment: { rating: '', interpretation: '', score: 0 },
    liquidationHeatmap: { rating: '', interpretation: '', score: 0 },
    newsSentiment: { rating: '', interpretation: '', score: 0 },
    overallSentimentAccuracy: '',
    overallMarketOutlook: { score: 0, tone: '', strategySuggestion: '' },
    marketData: {
      greenCount: 0,
      redCount: 0,
      greenPositiveFunding: 0,
      greenNegativeFunding: 0,
      redPositiveFunding: 0,
      redNegativeFunding: 0,
      priceUpFundingNegativeCount: 0,
      priceDownFundingPositiveCount: 0,
      topShortSqueeze: [],
      topLongTrap: [],
      totalLongLiquidationsUSD: 0,
      totalShortLiquidationsUSD: 0,
    },
    newsData: [],
    actionableSentimentSignals: [],
    actionableSentimentSummary: {
      bullishCount: 0,
      bearishCount: 0,
      tone: 'Neutral',
      interpretation: '',
      score: 0,
    },
    siteAData: null,
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const marketData = await getMarketData();
      const liquidationData = await fetchAggregatedLiquidationData();
      const newsArticles = await getNewsSentiment();

      const marketStats: MarketStats = {
        ...marketData,
        liquidationData: liquidationData,
        newsArticles: newsArticles,
        siteAData: siteAData,
      };

      const analysisResults = analyzeSentiment(marketStats);
      setMarketAnalysis(analysisResults);
    } catch (err) {
      setError('Failed to fetch and analyze market data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 60000);
    return () => clearInterval(intervalId);
  }, [siteAData]);

  return (
    <>
      <Head>
        <title>Binance Perpetual Futures Sentiment Analysis</title>
        <meta
          name="description"
          content="Real-time sentiment analysis for Binance perpetual futures."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <div className={styles.description}>
          <p>
            Binance Perpetual Futures Sentiment Analysis&nbsp;
            <code className={styles.code}>
              {new Date().toLocaleString()}
            </code>
          </p>
          <div>
            <a
              href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              By{' '}
              <Image
                src="/vercel.svg"
                alt="Vercel Logo"
                className={styles.vercelLogo}
                width={100}
                height={24}
                priority
              />
            </a>
          </div>
        </div>

        <SiteADataLoader onDataLoaded={setSiteAData} />

        <div className={styles.center}>
          <div className={styles.grid}>
            {loading ? (
              <p>Loading market data...</p>
            ) : error ? (
              <p className={styles.error}>{error}</p>
            ) : (
              <MarketAnalysisDisplay
                marketAnalysis={marketAnalysis}
                showDetails={true}
              />
            )}
          </div>
        </div>

        <div className={styles.grid}>
          <a
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
            target="_blank"
            rel="noopener noreferrer"
          >
            <h2 className={inter.className}>
              Docs <span>-&gt;</span>
            </h2>
            <p className={inter.className}>
              Find in-depth information about Next.js features and&nbsp;API.
            </p>
          </a>

          <a
            href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
            target="_blank"
            rel="noopener noreferrer"
          >
            <h2 className={inter.className}>
              Learn <span>-&gt;</span>
            </h2>
            <p className={inter.className}>
              Learn about Next.js in an interactive course with&nbsp;quizzes!
            </p>
          </a>

          <a
            href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
            target="_blank"
            rel="noopener noreferrer"
          >
            <h2 className={inter.className}>
              Templates <span>-&gt;</span>
            </h2>
            <p className={inter.className}>
              Discover and deploy boilerplate example Next.js&nbsp;projects.
            </p>
          </a>

          <a
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
            target="_blank"
            rel="noopener noreferrer"
          >
            <h2 className={inter.className}>
              Deploy <span>-&gt;</span>
            </h2>
            <p className={inter.className}>
              Instantly deploy your Next.js site to a shareable URL
              with&nbsp;Vercel.
            </p>
          </a>
        </div>
      </main>
    </>
  );
}
