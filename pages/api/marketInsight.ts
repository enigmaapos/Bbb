// pages/api/marketInsight.ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { greenLiquidity, redLiquidity, dominantLiquidity } = req.body;

    const prompt = `
      Global crypto futures summary:
      - Green Liquidity: ${greenLiquidity.toFixed(2)} USDT
      - Red Liquidity: ${redLiquidity.toFixed(2)} USDT
      - Dominant Side: ${dominantLiquidity}

      Write a concise AI insight (2–3 sentences) explaining market sentiment and possible direction.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
    });

    res.status(200).json({ insight: completion.choices[0].message.content });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to generate market insight" });
  }
}
