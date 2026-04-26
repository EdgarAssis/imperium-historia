export async function requestAI({ system, messages, maxTokens = 1400 }) {
  // Ajustado para a pasta correta da Vercel
  const response = await fetch('/api/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, messages, maxTokens }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error || `Erro na ligação à IA.`);
    throw error;
  }

  return String(data.text || '');
}
