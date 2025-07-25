// src/utils/newsFetcher.ts
import axios from 'axios';
import { SentimentArticle } from '../types';
import { getVaderSentiment } from './sentimentAnalyzer';

const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY; // ✅ Use NEXT_PUBLIC_ prefix
const NEWS_API_BASE_URL = "https://newsapi.org/v2";

export async function fetchCryptoNews(query: string): Promise<SentimentArticle[]> {
  if (!NEWS_API_KEY) {
    console.warn("🚫 NEWS_API_KEY is not set. Crypto news fetching skipped.");
    return [];
  }

  try {
    const response = await axios.get(`${NEWS_API_BASE_URL}/everything`, {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 5,
        apiKey: NEWS_API_KEY,
      },
    });

    const articles: SentimentArticle[] = response.data.articles.map((article: any) => {
      const sentimentResult = getVaderSentiment(`${article.title} ${article.description || ''}`);
      const sentimentScoreScaled = ((sentimentResult.compound + 1) / 2) * 10;

      return {
        source: article.source.name,
        author: article.author,
        title: article.title,
        description: article.description,
        url: article.url,
        urlToImage: article.urlToImage,
        publishedAt: article.publishedAt,
        content: article.content,
        sentimentScore: sentimentScoreScaled,
        sentimentCategory: sentimentResult.category,
      };
    });

    return articles;

  } catch (error) {
    console.error(`❌ Error fetching news for "${query}":`, error);
    return [];
  }
}
