// src/types/newsApiTypes.ts

export interface NewsApiArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

export interface NewsApiSuccessResponse {
  status: 'ok';
  totalResults: number;
  articles: NewsApiArticle[];
}

export interface NewsApiErrorResponse {
  status: 'error';
  code: string; // The error code (e.g., 'apiKeyMissing', 'rateLimited')
  message: string; // A more detailed description of the error
}

export type NewsApiResponse = NewsApiSuccessResponse | NewsApiErrorResponse;
