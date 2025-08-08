export default async function handler(req, res) {
  try {
    const { symbol } = req.query;
    const response = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=59');
    res.status(200).json(data);
  } catch (err) {
    console.error('Funding API proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch funding data' });
  }
}
