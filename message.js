export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { system, messages } = req.body;

  // Formata as mensagens para o padrão do Google Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    // Note que usamos process.env.MY_API_KEY para aceder à chave que guardaste na Vercel
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
    
    if (data.candidates && data.candidates[0]) {
      const aiText = data.candidates[0].content.parts[0].text;
      res.status(200).json({ text: aiText });
    } else {
      res.status(500).json({ error: 'Erro na resposta da API', details: data });
    }
  } catch (error) {
    res.status(500).json({ error: 'Falha ao ligar ao servidor de IA' });
  }
}
