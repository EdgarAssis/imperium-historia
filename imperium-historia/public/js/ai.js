export async function requestAI({ system, messages, maxTokens = 1400 }) {
  // Caminho relativo para a função que criaste acima
  const response = await fetch('/api/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, messages, maxTokens }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erro na IA');

  return data.text;
}
