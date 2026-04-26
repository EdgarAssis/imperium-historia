export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { system, messages } = req.body;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.MY_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        system_instruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: 1400, temperature: 0.7 }
      })
    });

    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;
    res.status(200).json({ text: aiText });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ligar ao Gemini' });
  }
}
