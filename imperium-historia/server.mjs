import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number.parseInt(process.env.PORT || '3000', 10);
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const maxBodyBytes = 1_000_000;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
]);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function safeStaticPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const normalized = decoded === '/' ? '/index.html' : decoded;
  const requestedPath = path.normalize(path.join(publicDir, normalized));
  if (!requestedPath.startsWith(publicDir)) return null;
  return requestedPath;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validateAiPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Pedido inválido.';
  if (typeof payload.system !== 'string') return 'Campo system em falta.';
  if (!Array.isArray(payload.messages)) return 'Campo messages deve ser uma lista.';
  const badMessage = payload.messages.find(message => {
    return !message
      || typeof message !== 'object'
      || !['user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string';
  });
  if (badMessage) return 'Mensagens devem ter role user/assistant e content string.';
  return null;
}

async function handleAiMessage(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJson(res, error.message === 'Payload too large' ? 413 : 400, {
      error: error.message === 'Payload too large' ? 'Pedido demasiado grande.' : 'JSON inválido.',
      fallback: true,
    });
  }

  const validationError = validateAiPayload(payload);
  if (validationError) {
    return sendJson(res, 400, { error: validationError, fallback: true });
  }

  if (!anthropicKey) {
    return sendJson(res, 503, {
      error: 'ANTHROPIC_API_KEY não está configurada no servidor.',
      fallback: true,
    });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: Math.min(Math.max(Number(payload.maxTokens) || 1400, 128), 3000),
        system: payload.system,
        messages: payload.messages,
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || data.error) {
      const message = data.error?.message || `Anthropic respondeu com HTTP ${upstream.status}.`;
      return sendJson(res, 502, { error: message, fallback: true });
    }

    const text = data.content?.find(part => part.type === 'text')?.text || '';
    return sendJson(res, 200, { text });
  } catch (error) {
    return sendJson(res, 502, {
      error: `Falha ao contactar Anthropic: ${error.message}`,
      fallback: true,
    });
  }
}

async function serveStatic(req, res, pathname) {
  const staticPath = safeStaticPath(pathname);
  const fileStat = staticPath && existsSync(staticPath)
    ? await stat(staticPath).catch(() => null)
    : null;
  if (!staticPath || !fileStat || !fileStat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(staticPath).toLowerCase();
  const contentType = mimeTypes.get(ext) || 'application/octet-stream';
  const headers = {
    'content-type': contentType,
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  };

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(staticPath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Failed to read file');
  });
  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      aiConfigured: Boolean(anthropicKey),
      model: anthropicModel,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/message') {
    return handleAiMessage(req, res);
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, url.pathname);
  }

  res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

try {
  await readFile(path.join(publicDir, 'index.html'), 'utf8');
} catch {
  console.warn('Aviso: public/index.html ainda não existe.');
}

server.listen(port, () => {
  const aiStatus = anthropicKey ? 'IA real ativa' : 'sem chave: fallback local ativo';
  console.log(`Imperium Historia em http://localhost:${port} (${aiStatus})`);
});
