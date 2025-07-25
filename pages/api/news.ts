// pages/api/news.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";

// 1-hour cache duration
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache (keyed by query + sortBy + pageSize)
const cache: Record<string, { data: SimplifiedArticle[]; timestamp: number }> = {};

interface NewsAPIArticle {
  title: string;
  url: string;
  source: { name: string };
  publishedAt: string;
}

interface NewsApiResponse {
  articles: NewsAPIArticle[];
}

interface SimplifiedArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SimplifiedArticle[] | { message: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { q, sortBy = "relevancy", pageSize = "5" } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ message: 'Query parameter "q" is required and must be a string.' });
  }

  if (!NEWS_API_KEY) {
    console.error("Server Error: NEWS_API_KEY is not set.");
    return res.status(500).json({ message: "Server configuration error: API key missing." });
  }

  // Construct a cache key based on the query parameters
  const cacheKey = `${q}_${sortBy}_${pageSize}`;
  const now = Date.now();

  // Check cache
  if (cache[cacheKey] && now - cache[cacheKey].timestamp < CACHE_DURATION_MS) {
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const response = await axios.get<NewsApiResponse>(NEWS_API_BASE_URL, {
      params: {
        q: `${q} crypto OR blockchain`,
        language: "en",
        sortBy,
        pageSize,
        apiKey: NEWS_API_KEY,
      },
    });

    const simplified: SimplifiedArticle[] = response.data.articles.map(article => ({
      title: article.title,
      url: article.url,
      source: article.source.name,
      publishedAt: article.publishedAt,
    }));

    // Save to cache
    cache[cacheKey] = {
      data: simplified,
      timestamp: now,
    };

    res.status(200).json(simplified);

  } catch (error: any) {
    console.error("Error in News API proxy route:", error.message);
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Failed to fetch news from external API.";
    res.status(statusCode).json({ message: `External API Error: ${errorMessage}` });
  }
}
