// pages/api/news.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
// Import the sentiment analysis function
import { analyzeSentiment as getNewsSentiment } from '../../src/utils/sentimentAnalyzer'; // Renamed to avoid conflict

// IMPORTANT: This API key does NOT need NEXT_PUBLIC_ prefix here
// because it's only used on the server-side.
const NEWS_API_KEY = process.env.NEWS_API_KEY; // This is correct for server-side
const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";

// Define an interface for the article structure expected from NewsAPI
// ADDED 'description' and 'content' fields
interface NewsAPIArticle {
  title: string;
  url: string;
  source: {
    id: string | null; // NewsAPI sometimes includes an ID for the source
    name: string;
  };
  publishedAt: string;
  description: string | null; // Add description
  content: string | null;    // Add content (Note: often truncated by NewsAPI free tier)
  author: string | null; // Often available
  urlToImage: string | null; // Often available
}

// Define an interface for the NewsAPI response structure
interface NewsApiResponse {
  status: string; // 'ok' or 'error'
  totalResults: number;
  articles: NewsAPIArticle[];
}

// Define the shape of the data you want to return to your frontend
// ADDED sentiment fields
interface SimplifiedArticle {
  title: string;
  url: string;
  source: string; // Flattened source name
  publishedAt: string;
  description?: string | null; // Optionally include description
  content?: string | null;     // Optionally include content
  sentimentScore: number;
  sentimentCategory: 'positive' | 'negative' | 'neutral';
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

    // Check for NewsAPI errors in the response body
    if (newsApiResponse.data.status === 'error') {
        const errorCode = newsApiResponse.data.code;
        const errorMessage = newsApiResponse.data.message;
        console.error(`NewsAPI returned error: ${errorCode} - ${errorMessage}`);
        // Map NewsAPI errors to appropriate HTTP status codes if known, else 500
        let httpStatusCode = 500;
        if (errorCode === 'apiKeyInvalid' || errorCode === 'apiKeyDisabled') httpStatusCode = 401;
        if (errorCode === 'rateLimited' || errorCode === 'maximumResultsReached') httpStatusCode = 429;
        if (errorCode === 'parametersMissing' || errorCode === 'parameterInvalid') httpStatusCode = 400;

        return res.status(httpStatusCode).json({ message: `News API Error: ${errorMessage}` });
    }

    // Process and simplify the articles and perform sentiment analysis
    const analyzedArticles: SimplifiedArticle[] = newsApiResponse.data.articles
        .filter(article => article.title) // Ensure title exists for analysis
        .map(article => {
            // NewsAPI 'content' field is often truncated (e.g., to 200-260 chars for free tier).
            // 'description' is also a good short snippet.
            // Prioritize content, then description, then title for sentiment analysis.
            const textForSentiment = article.content || article.description || article.title;

            // Perform sentiment analysis using the imported function
            // Note: Your analyzeSentiment function in src/utils/sentimentAnalyzer.ts expects MarketStats
            // We need a specific function for single article sentiment analysis, or adapt `analyzeSentiment`
            // For now, I'll assume you adapt `src/utils/sentimentAnalyzer.ts` to expose `getVaderSentiment`
            // or a similar simple article analysis function.
            // For this example, let's assume `getNewsSentiment` is a direct alias to the VADER helper function.

            // If you already set up getVaderSentiment in sentimentAnalyzer.ts:
            // const { compound, category } = getVaderSentiment(textForSentiment);

            // If you did NOT expose getVaderSentiment, you'd put the basic VADER logic here:
            // This is a placeholder for actual VADER sentiment analysis
            let sentimentScore = 0;
            let sentimentCategory: 'positive' | 'negative' | 'neutral' = 'neutral';

            // Placeholder for VADER integration in getNewsSentiment. Make sure it returns { compound, category }
            const sentimentResult = getNewsSentiment({ // Mock MarketStats for getNewsSentiment
                 green: 0, red: 0, fundingStats: { // Dummy values, as we are only using newsArticles
                    greenPositiveFunding: 0, greenNegativeFunding: 0,
                    redPositiveFunding: 0, redNegativeFunding: 0,
                 },
                 volumeData: [], liquidationData: null,
                 newsArticles: [{ title: article.title, url: article.url, source: article.source.name, publishedAt: article.publishedAt, description: article.description, content: article.content, sentimentScore: 0, sentimentCategory: 'neutral' }] // Pass current article for analysis
            }).newsSentiment; // Get the newsSentiment part from the result

            sentimentScore = sentimentResult.score; // Use the score from the aggregated news sentiment
            sentimentCategory = sentimentResult.rating.toLowerCase().includes('bullish') ? 'positive' :
                                sentimentResult.rating.toLowerCase().includes('bearish') ? 'negative' : 'neutral';


            return {
                title: article.title,
                url: article.url,
                source: article.source.name,
                publishedAt: article.publishedAt,
                description: article.description, // Include description
                content: article.content,       // Include content
                sentimentScore: sentimentScore,
                sentimentCategory: sentimentCategory,
            };
        });

    // Send the processed and analyzed data back to your frontend
    res.status(200).json(analyzedArticles);

  } catch (error: any) {
    console.error("Error in News API proxy route:", error.message);
    // Attempt to pass through the original status code and message from NewsAPI
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Failed to fetch news from external API.";
    res.status(statusCode).json({ message: `External API Error: ${errorMessage}` });
  }
}
