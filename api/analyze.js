export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify user is logged in via Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Please log in to use DataBridge AI.' });

    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase
    const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': process.env.SUPABASE_ANON_KEY
      }
    });
    const userData = await userRes.json();
    if (!userData.id) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    const userId = userData.id;

    // 2. Check usage limit (5 free analyses)
    const usageRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usage?user_id=eq.${userId}&select=count`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
      }
    });
    const usageData = await usageRes.json();
    const usageCount = usageData[0]?.count || 0;

    if (usageCount >= 5) {
      return res.status(403).json({ error: 'Free limit reached (5 analyses). Upgrade to continue.' });
    }

    // 3. Run the AI
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch(e) { return res.status(500).json({ error: 'AI error: ' + raw.slice(0, 200) }); }

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.choices?.[0]?.message?.content || 'No response received.';

    // 4. Log usage
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
      },
      body: JSON.stringify({ user_id: userId, created_at: new Date().toISOString() })
    });

    return res.status(200).json({ result: text, remaining: 4 - usageCount });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
