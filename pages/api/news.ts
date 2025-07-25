// pages/api/news.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getVaderSentiment } from '../../utils/sentimentAnalyzer';

const NEWS_API_KEY = process.env.NEWS_API_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!NEWS_API_KEY) {
    return res.status(500).json({ error: "NEWS_API_KEY not set" });
  }

  const { query } = req.query;

  try {
    const response = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: query || 'crypto',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 5,
        apiKey: NEWS_API_KEY,
      },
    });

    const articles = response.data.articles.map((article: any) => {
      const sentiment = getVaderSentiment(article.title + ' ' + (article.description || ''));
      return {
        ...article,
        sentimentCategory: sentiment.category,
        sentimentScore: ((sentiment.compound + 1) / 2) * 10,
      };
    });

    return res.status(200).json({ articles });
  } catch (err) {
    console.error("News fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch news" });
  }
}
