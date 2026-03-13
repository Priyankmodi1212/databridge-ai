export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    const apiKey = 'AIzaSyC3tFhnv4mgunhhTSz0zVSn6Gd7o2PebsU';
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const raw = await response.text();

    let data;
    try { data = JSON.parse(raw); }
    catch(e) { return res.status(500).json({ error: 'Gemini error: ' + raw.slice(0, 200) }); }

    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
    return res.status(200).json({ result: text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
