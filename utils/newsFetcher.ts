// src/utils/newsFetcher.ts
import axios from 'axios';
import { SentimentArticle } from '../types'; // Import SentimentArticle
import { getVaderSentiment } from './sentimentAnalyzer'; // Import the sentiment analyzer

const NEWSAPI_KEY = process.env.NEWSAPI_KEY; // Make sure this is set in your .env.local file
const NEWSAPI_BASE_URL = "https://newsapi.org/v2";

export async function fetchCryptoNews(query: string): Promise<SentimentArticle[]> {
  if (!NEWSAPI_KEY) {
    console.warn("NEWSAPI_KEY is not set. Crypto news fetching skipped.");
    return [];
  }

  try {
    const response = await axios.get(`${NEWSAPI_BASE_URL}/everything`, {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 5, // Fetch top 5 articles per query
        apiKey: NEWSAPI_KEY,
      },
    });

    const articles: SentimentArticle[] = response.data.articles.map((article: any) => {
      // Analyze sentiment for each article
      const sentimentResult = getVaderSentiment(article.title + ' ' + (article.description || '')); // Analyze title and description
      const sentimentScoreScaled = ((sentimentResult.compound + 1) / 2) * 10; // Scale from -1 to 1 to 0-10

      return {
        source: article.source.name,
        author: article.author,
        title: article.title,
        description: article.description,
        url: article.url,
        urlToImage: article.urlToImage,
        publishedAt: article.publishedAt,
        content: article.content,
        sentimentScore: sentimentScoreScaled, // Attach the calculated sentiment score (0-10)
        sentimentCategory: sentimentResult.category, // Attach the sentiment category
      };
    });

    return articles;

  } catch (error) {
    console.error(`Error fetching news for "${query}":`, error);
    // You might want more sophisticated error handling, e.g.,
    // if (axios.isAxiosError(error)) {
    //   console.error("News API Error:", error.response?.data);
    // }
    return [];
  }
}
