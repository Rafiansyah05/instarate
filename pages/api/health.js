export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: !!process.env.GEMINI_API_KEY,
  });
}
