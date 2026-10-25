import type { IsoDate } from './types';

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function parts(iso: IsoDate): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** Fecha local de hoy en ISO corto. */
export function todayIso(now = new Date()): IsoDate {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** '2026-09' para una fecha. */
export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}

/** 'setiembre 2026' */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export function monthName(key: string): string {
  return MESES[Number(key.slice(5, 7)) - 1];
}

/** 'sáb 27 set' */
export function shortDate(iso: IsoDate): string {
  const [y, m, d] = parts(iso);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DIAS[dow]} ${d} ${MES_CORTO[m - 1]}`;
}

/** '27 de setiembre de 2026' */
export function longDate(iso: IsoDate): string {
  const [y, m, d] = parts(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Mes anterior o siguiente: shiftMonth('2026-01', -1) → '2025-12'. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Días de `from` a `to` (negativo si `to` es anterior). Cuenta días de calendario, sin horas ni cambios de horario. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** La fecha `delta` días después (o antes, si es negativo). */
export function shiftDay(iso: IsoDate, delta: number): IsoDate {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Día de la semana, 0 = domingo. */
export function weekday(iso: IsoDate): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Último día del mes de una clave '2026-02' → 28. */
export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const DIAS_CAP = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** 'Vie' */
export function weekdayShort(iso: IsoDate): string {
  const [y, m, d] = parts(iso);
  return DIAS_CAP[new Date(y, m - 1, d).getDay()];
}

/** 'Hoy', 'Ayer' o 'vie 2 oct'. */
export function relativeDay(iso: IsoDate, today: IsoDate = todayIso()): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return shortDate(iso);
}

/** Vencimiento: 'Vie 9 · en 3 días', 'Vie 9 · mañana', 'Vie 9 · hoy', 'Vie 9 · venció hace 2 días'. */
export function dueLabel(due: IsoDate, today: IsoDate = todayIso()): string {
  const left = daysBetween(today, due);
  const when = left === 0 ? 'hoy' : left === 1 ? 'mañana' : left > 1 ? `en ${left} días` : left === -1 ? 'venció ayer' : `venció hace ${-left} días`;
  return `${weekdayShort(due)} ${Number(due.slice(8, 10))} · ${when}`;
}

/** Hora local de un instante ISO: '11:20'. */
export function timeOf(isoInstant: string): string {
  const d = new Date(isoInstant);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
