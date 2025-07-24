// src/utils/newsFetcher.ts
import axios from 'axios';
import { SentimentArticle } from '../types';

const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";
// *** IMPORTANT CHANGE HERE ***
const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY!; // Now it correctly accesses the public env variable

interface Article {
  title: string;
  url: string;
  source: {
    name: string;
  };
  publishedAt: string;
}

interface NewsApiResponse {
  articles: Article[];
}

// Return type changed to SentimentArticle[] for consistency
export async function fetchCryptoNews(query: string, sortBy: string = "relevancy", pageSize: number = 5): Promise<SentimentArticle[]> {
  try {
    const response = await axios.get<NewsApiResponse>(NEWS_API_BASE_URL, {
      params: {
        q: `${query} crypto OR blockchain`,
        language: "en",
        sortBy: sortBy,
        pageSize: pageSize,
        apiKey: NEWS_API_KEY,
      },
    });
    // Map to SentimentArticle type
    return response.data.articles.map(article => ({
      title: article.title,
      url: article.url,
      source: article.source.name,
      publishedAt: article.publishedAt
    }));
  } catch (error) {
    console.error(`Error fetching news for ${query}:`, error);
    return [];
  }
}
