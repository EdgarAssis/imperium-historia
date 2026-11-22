// src/components/game/OrderBox.tsx
// Caixa de ordens em texto livre. Limite de 500 caracteres. Botões:
//   - «Enviar ordens»: chama /api/turn via store.submitOrders, aplica mudanças.
//   - «Terminar turno»: chama store.endTurn (motor determinístico).
// Mostra estado de carregamento («O mundo está a reagir…»), erro com botão
// «Tentar de novo» e timeout implícito de 60s (a rota impõe).

"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Send, AlertCircle, Eraser } from "lucide-react";

const MAX_ORDERS = 500;

export function OrderBox() {
  const state = useGameStore((s) => s.state);
  const submitting = useGameStore((s) => s.submitting);
  const submitError = useGameStore((s) => s.submitError);
  const submitOrders = useGameStore((s) => s.submitOrders);

  const [orders, setOrders] = useState("");

  if (!state) return null;

  const remaining = MAX_ORDERS - orders.length;
  const tooLong = orders.length > MAX_ORDERS;

  function handleOrdersChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    // Corta no MAX_ORDERS + 10 para mostrar o contador a vermelho.
    setOrders(text.slice(0, MAX_ORDERS + 10));
  }

  async function handleSubmitOrders() {
    if (submitting) return;
    if (tooLong) return;
    const result = await submitOrders(orders);
    if (result.ok) {
      // Limpa a caixa após sucesso.
      setOrders("");
    }
  }

  function handleClear() {
    setOrders("");
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Caixa de ordens</CardTitle>
        <CardDescription>
          Escreve instruções em texto livre (até {MAX_ORDERS} caracteres). O
          narrador reage; o estado só muda dentro de limites plausíveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="orders" className="sr-only">
            Ordens
          </Label>
          <Textarea
            id="orders"
            value={orders}
            onChange={handleOrdersChange}
            placeholder="Ex.: Aumenta o investimento em saúde. Propõe um pacto de não-agressão à vizinha. Mobiliza tropas para a fronteira leste."
            className="resize-none text-sm min-h-[120px] max-h-[200px]"
            rows={6}
            maxLength={MAX_ORDERS + 10}
            disabled={submitting}
            aria-describedby="orders-counter"
          />
          <div
            id="orders-counter"
            className={`text-right text-xs ${
              tooLong
                ? "text-destructive"
                : remaining < 50
                  ? "text-amber-600"
                  : "text-muted-foreground"
            }`}
          >
            {orders.length}/{MAX_ORDERS}
          </div>
        </div>

        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{submitError}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSubmitOrders}
                disabled={submitting || tooLong}
              >
                Tentar de novo
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSubmitOrders} disabled={submitting || tooLong} size="sm" className="flex-1">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                O mundo está a reagir…
              </>
            ) : (
              <>
                <Send className="size-4" />
                Enviar ordens
              </>
            )}
          </Button>
          {orders.length > 0 && !submitting && (
            <Button onClick={handleClear} size="sm" variant="ghost" aria-label="Limpar ordens">
              <Eraser className="size-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
