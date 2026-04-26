export async function requestAI({ system, messages, maxTokens = 1400 }) {
  const response = await fetch('/api/ai/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, messages, maxTokens }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error || `Pedido de IA falhou com HTTP ${response.status}.`);
    error.fallback = Boolean(data.fallback);
    throw error;
  }

  return String(data.text || '');
}
