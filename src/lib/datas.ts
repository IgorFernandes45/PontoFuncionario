/**
 * Datas de escala são dias de calendário, não instantes. Tudo aqui trabalha
 * com strings `YYYY-MM-DD` e aritmética em UTC — usar o fuso local do
 * servidor faria a semana pular um dia dependendo de onde o app roda.
 */

const DIA_MS = 86_400_000;

function parse(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function formatar(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, n: number): string {
  return formatar(new Date(parse(iso).getTime() + n * DIA_MS));
}

/** Segunda-feira da semana do dia informado. */
export function inicioSemana(iso: string): string {
  const d = parse(iso);
  const dow = d.getUTCDay(); // 0 = domingo
  return somarDias(iso, -((dow + 6) % 7));
}

export function diasDaSemana(inicio: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

/** Hoje segundo o fuso da empresa, que é o que define a semana em cartaz. */
export function hojeNaEmpresa(timezone: string): string {
  // en-CA formata como YYYY-MM-DD, que é exatamente o formato que usamos.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
}

/** 0 = domingo, como `extract(dow)` no Postgres. */
export function diaDaSemana(iso: string): number {
  return parse(iso).getUTCDay();
}

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function rotuloCurto(iso: string): string {
  return DIAS_CURTOS[diaDaSemana(iso)];
}

export function rotuloLongoDow(dow: number): string {
  return DIAS_LONGOS[dow];
}

export function diaDoMes(iso: string): string {
  return iso.slice(8, 10);
}

export function rotuloPeriodo(inicio: string): string {
  const fim = somarDias(inicio, 6);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }).format(parse(iso));
  return `${fmt(inicio)} – ${fmt(fim)}`;
}

/** Ordem de exibição: segunda a domingo, como se lê um quadro de escala. */
export const DOWS_ORDENADOS = [1, 2, 3, 4, 5, 6, 0];
