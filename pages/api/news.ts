// pages/api/news.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// This API key does NOT need NEXT_PUBLIC_ prefix here
// because it's only used on the server-side.
const NEWS_API_KEY = process.env.NEWS_API_KEY; // This is correct for server-side
const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";

// Define an interface for the article structure expected from NewsAPI
interface NewsAPIArticle {
  title: string;
  url: string;
  source: {
    name: string;
  };
  publishedAt: string;
}

// Define an interface for the NewsAPI response structure
interface NewsApiResponse {
  articles: NewsAPIArticle[];
}

// Define the shape of the data you want to return to your frontend
interface SimplifiedArticle {
  title: string;
  url: string;
  source: string; // Flattened source name
  publishedAt: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SimplifiedArticle[] | { message: string }>
) {
  // Only allow GET requests to this API route
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Extract query parameters from your frontend request
  const { q, sortBy, pageSize } = req.query;

  // Basic validation for required query parameter 'q'
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ message: 'Query parameter "q" is required and must be a string.' });
  }

  // Ensure the API key is set in your server's environment
  if (!NEWS_API_KEY) {
    console.error("Server Error: NEWS_API_KEY is not set in environment variables.");
    return res.status(500).json({ message: "Server configuration error: API key missing." });
  }

  try {
    // Make the actual call to NewsAPI.org from your server
    const newsApiResponse = await axios.get<NewsApiResponse>(NEWS_API_BASE_URL, {
      params: {
        q: `${q} crypto OR blockchain`, // Use the query from your frontend
        language: "en",
        sortBy: sortBy || "relevancy", // Default values if not provided by frontend
        pageSize: pageSize || 5,
        apiKey: NEWS_API_KEY, // Use your API key here (server-side)
      },
    });

    // Process and simplify the articles before sending them to the frontend
    const simplifiedArticles: SimplifiedArticle[] = newsApiResponse.data.articles.map(article => ({
      title: article.title,
      url: article.url,
      source: article.source.name,
      publishedAt: article.publishedAt
    }));

    // Send the processed data back to your frontend
    res.status(200).json(simplifiedArticles);

  } catch (error: any) {
    console.error("Error in News API proxy route:", error.message);
    // Attempt to pass through the original status code and message from NewsAPI
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Failed to fetch news from external API.";
    res.status(statusCode).json({ message: `External API Error: ${errorMessage}` });
  }
}
