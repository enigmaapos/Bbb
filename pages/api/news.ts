// pages/api/news.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import { getVaderSentiment } from '../../utils/sentimentAnalyzer';

// Corrected import for NewsAPI types from the new dedicated file
import {
  NewsApiResponse,
  NewsApiArticle,
  NewsApiSuccessResponse, // For type guarding
  NewsApiErrorResponse    // For type guarding
} from '../../types/newsApiTypes'; // Path to the new file


const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const NEWSAPI_BASE_URL = "https://newsapi.org/v2/everything";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { query } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ message: 'Missing or invalid query parameter' });
  }

  if (!NEWSAPI_KEY) {
    console.error("NEWSAPI_KEY is not set in environment variables.");
    return res.status(500).json({ message: "Server configuration error: API key missing." });
  }

  try {
    const newsUrl = `${NEWSAPI_BASE_URL}?q=${encodeURIComponent(query)}&apiKey=${NEWSAPI_KEY}&sortBy=relevancy&language=en&pageSize=10`;

    // Ensure axios response data is typed as NewsApiResponse
    const newsApiResponse = await axios.get<NewsApiResponse>(newsUrl);

    // Type guard for error response
    if (newsApiResponse.data.status === 'error') {
      const { code, message } = newsApiResponse.data; // Destructure safely due to type guard
      console.error(`NewsAPI returned error: ${code} - ${message}`);

      let httpStatusCode = 500;

      switch (code) {
        case 'apiKeyMissing':
        case 'apiKeyInvalid':
        case 'apiKeyDisabled':
        case 'apiKeyExhausted':
          httpStatusCode = 401;
          break;
        case 'parametersMissing':
        case 'parameterInvalid':
          httpStatusCode = 400;
          break;
        case 'rateLimited':
          httpStatusCode = 429;
          break;
        case 'sourcesTooMany':
        case 'sourceDoesNotExist':
          httpStatusCode = 400;
          break;
        default:
          httpStatusCode = 500;
      }

      return res.status(httpStatusCode).json({
        message: `News API Error: ${message}`,
        code: code,
      });

    } else {
      // TypeScript now knows newsApiResponse.data is NewsApiSuccessResponse
      const articles = newsApiResponse.data.articles;

      if (!articles || articles.length === 0) {
        return res.status(200).json({ articles: [], message: 'No articles found.' });
      }

      const articlesWithSentiment = articles.map((article: NewsApiArticle) => {
        const sentimentResult = getVaderSentiment(article.content || article.description || article.title);
        return {
          ...article,
          sentiment: sentimentResult,
        };
      });

      return res.status(200).json({ articles: articlesWithSentiment });
    }

  } catch (error: any) {
    console.error("Error fetching news:", error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return res.status(axiosError.response.status).json({
          message: `External API error: ${axiosError.response.statusText || 'Unknown'}`,
          details: axiosError.response.data,
        });
      } else if (axiosError.request) {
        return res.status(503).json({ message: 'No response received from external API.' });
      } else {
        return res.status(500).json({ message: 'Error setting up request to external API.' });
      }
    }

    return res.status(500).json({ message: 'Internal server error' });
  }
}
