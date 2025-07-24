// pages/api/news.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
// IMPORTANT: Correct Import - import the specific helper function for VADER sentiment analysis
import { getVaderSentiment } from '../../src/utils/sentimentAnalyzer';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";

// Define an interface for the article structure expected from NewsAPI
interface NewsAPIArticle {
  title: string;
  url: string;
  source: {
    id: string | null;
    name: string;
  };
  publishedAt: string;
  description: string | null;
  content: string | null;
  author: string | null;
  urlToImage: string | null;
}

// Define an interface for the NewsAPI response structure
interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

// Define the shape of the data you want to return to your frontend
// This must match the SentimentArticle interface in src/types.ts
interface SimplifiedArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string | null;
  content: string | null;
  sentimentScore: number;
  sentimentCategory: 'positive' | 'negative' | 'neutral';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SimplifiedArticle[] | { message: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { q, sortBy, pageSize } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ message: 'Query parameter "q" is required and must be a string.' });
  }

  if (!NEWS_API_KEY) {
    console.error("Server Error: NEWS_API_KEY is not set in environment variables.");
    return res.status(500).json({ message: "Server configuration error: API key missing." });
  }

  try {
    const newsApiResponse = await axios.get<NewsApiResponse>(NEWS_API_BASE_URL, {
      params: {
        q: `${q} crypto OR blockchain`,
        language: "en",
        sortBy: sortBy || "relevancy",
        pageSize: pageSize || 5,
        apiKey: NEWS_API_KEY,
      },
    });

    if (newsApiResponse.data.status === 'error') {
        const errorCode = newsApiResponse.data.code;
        const errorMessage = newsApiResponse.data.message;
        console.error(`NewsAPI returned error: ${errorCode} - ${errorMessage}`);
        let httpStatusCode = 500;
        if (errorCode === 'apiKeyInvalid' || errorCode === 'apiKeyDisabled') httpStatusCode = 401;
        if (errorCode === 'rateLimited' || errorCode === 'maximumResultsReached') httpStatusCode = 429;
        if (errorCode === 'parametersMissing' || errorCode === 'parameterInvalid') httpStatusCode = 400;

        return res.status(httpStatusCode).json({ message: `News API Error: ${errorMessage}` });
    }

    const analyzedArticles: SimplifiedArticle[] = newsApiResponse.data.articles
        .filter(article => article.title) // Ensure title exists for analysis
        .map(article => {
            // Prioritize content, then description, then title for sentiment analysis.
            // Ensure a string is always passed to getVaderSentiment
            const textForSentiment = article.content || article.description || article.title || '';

            // --- THIS IS THE CRUCIAL CHANGE ---
            // Call the specific getVaderSentiment helper function directly for each article
            const { compound, category } = getVaderSentiment(textForSentiment);

            // Map VADER's -1 to +1 compound score to your 1-10 scale
            // (compound + 1) * 4.5 + 1 will map -1 to 1, 0 to 5.5, 1 to 10
            const sentimentScore = parseFloat(((compound + 1) * 4.5 + 1).toFixed(2));

            return {
                title: article.title,
                url: article.url,
                source: article.source.name,
                publishedAt: article.publishedAt,
                description: article.description,
                content: article.content,
                sentimentScore: sentimentScore,
                sentimentCategory: category,
            };
        });

    res.status(200).json(analyzedArticles);

  } catch (error: any) {
    console.error("Error in News API proxy route:", error.message);
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Failed to fetch news from external API.";
    res.status(statusCode).json({ message: `External API Error: ${errorMessage}` });
  }
}
