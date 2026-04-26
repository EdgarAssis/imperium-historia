# Imperium Historia

Base local jogável para o protótipo `Imperium Historia`.

## Executar

```powershell
cd "C:\Users\h\Documents\New project\imperium-historia"
node server.mjs
```

Depois abre `http://localhost:3000`.

## IA real

Sem chave, o jogo usa narrativas locais de fallback e continua jogável.

Para usar Anthropic pelo proxy local:

```powershell
$env:ANTHROPIC_API_KEY="a tua chave"
node server.mjs
```

O browser nunca recebe a chave; ele fala apenas com `POST /api/ai/message`.

## Estrutura

- `server.mjs`: servidor estático e proxy Anthropic sem dependências npm.
- `public/`: frontend vanilla em módulos ES.
- `legacy/imperium_v4.html`: cópia preservada do protótipo original.
