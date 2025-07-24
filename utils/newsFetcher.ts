// src/utils/newsFetcher.ts
import axios from 'axios';
import { SentimentArticle } from '../types'; // Import SentimentArticle

// IMPORTANT: In a real application, you should proxy this API call through
// your own backend or a Vercel Serverless Function to keep your API key secure.
// For demonstration, it's directly here.

const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";
const NEWS_API_KEY = "YOUR_NEWS_API_KEY"; // Replace with your actual News API key

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
        q: `${query} crypto OR blockchain`, // Broader search for crypto relevance
        language: "en",
        sortBy: sortBy, // 'relevancy', 'popularity', 'publishedAt'
        pageSize: pageSize,
        apiKey: NEWS_API_KEY,
      },
    });
    // Map to SentimentArticle type
    return response.data.articles.map(article => ({
      title: article.title,
      url: article.url,
      source: article.source.name, // Flatten source
      publishedAt: article.publishedAt
    }));
  } catch (error) {
    console.error(`Error fetching news for ${query}:`, error);
    return [];
  }
}
