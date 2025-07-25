// src/utils/newsFetcher.ts (updated to use your API route)
import axios from 'axios';
import { SentimentArticle } from '../types'; // Assuming SentimentArticle matches your desired output
import { getVaderSentiment } from './sentimentAnalyzer'; // Import the sentiment analyzer

// Your frontend now calls your OWN Next.js API route
const LOCAL_NEWS_API_ROUTE = "/api/news"; // Relative path to your API route

export async function fetchCryptoNews(query: string, sortBy: string = "relevancy", pageSize: number = 5): Promise<SentimentArticle[]> {
  try {
    // Make the request to your local Next.js API route
    // The query, sortBy, and pageSize parameters are passed through to your API route
    const response = await axios.get<SentimentArticle[]>(LOCAL_NEWS_API_ROUTE, {
      params: {
        q: query,
        sortBy: sortBy,
        pageSize: pageSize,
      },
    });

    // Your API route should already return SentimentArticle[], so direct return
    return response.data;

  } catch (error) {
    console.error(`Error fetching news for ${query} via proxy:`, error);
    // You might want to provide a more user-friendly error message here
    return [];
  }
}
