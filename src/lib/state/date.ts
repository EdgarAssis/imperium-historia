// src/lib/state/date.ts
// Funções puras para aritmética de datas no mundo do jogo.
// Trabalhamos com strings ISO «YYYY-MM-DD» para evitar problemas de fuso e serialização.

/** Adiciona dias a uma data ISO. Não altera a data de entrada. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data ISO inválida: ${iso}`);
  }
  const ms = date.getTime() + days * 86_400_000;
  const nova = new Date(ms);
  return `${pad4(nova.getUTCFullYear())}-${pad2(nova.getUTCMonth() + 1)}-${pad2(nova.getUTCDate())}`;
}

/** Adiciona meses a uma data ISO. Não altera a data de entrada. */
export function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data ISO inválida: ${iso}`);
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const total = year * 12 + month + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total % 12;
  // Clamp do dia para o último dia válido do mês (ex.: 31 de janeiro + 1 mês -> 28/29 de fevereiro).
  const lastDay = lastDayOfMonth(newYear, newMonth);
  const safeDay = Math.min(day, lastDay);
  return `${pad4(newYear)}-${pad2(newMonth + 1)}-${pad2(safeDay)}`;
}

/** Adiciona anos a uma data ISO. */
export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** Último dia do mês (1-indexado: 1=Janeiro). */
function lastDayOfMonth(year: number, month: number): number {
  // mês 0 = Janeiro -> Date.UTC(year, month+1, 0) devolve o último dia do mês.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function pad4(n: number): string {
  return n < 0 ? `-${Math.abs(n).toString().padStart(4, "0")}` : n.toString().padStart(4, "0");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Formata uma data ISO no estilo legível português: «1 de janeiro de 2025». */
export function formatDatePT(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const day = date.getUTCDate();
  const month = meses[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} de ${month} de ${year}`;
}
