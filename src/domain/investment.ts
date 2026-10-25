import { round2 } from './money';

/** Dónde tiene la plata invertida, con el valor que registra la persona (no hay cotizaciones en línea). */
export interface Holding {
  id: string;
  name: string;
  valueUsd: number;
}

export interface InvestmentGoal {
  id: string;
  name: string;
  targetUsd: number;
  savedUsd: number;
  byYear?: number;
  monthlyUsd?: number;
}

export interface SimulationAssumptions {
  monthlyUsd: number;
  years: number;
  /** 0.05 = 5 % anual. */
  annualRate: number;
}

export function portfolioValue(p: { holdings: Holding[]; contributedUsd: number }) {
  const value = round2(p.holdings.reduce((s, h) => s + h.valueUsd, 0));
  const gain = round2(value - p.contributedUsd);
  return { value, contributed: p.contributedUsd, gain, gainShare: p.contributedUsd ? gain / p.contributedUsd : 0 };
}

/** Valor futuro con aportes mensuales y capitalización mensual. No es una recomendación: usa el rendimiento que elija la persona. */
export function futureValue(input: { initial: number; monthly: number; years: number; annualRate: number }): number {
  const n = Math.round(input.years * 12);
  const r = input.annualRate / 12;
  if (r === 0) return round2(input.initial + input.monthly * n);
  const growth = (1 + r) ** n;
  return round2(input.initial * growth + (input.monthly * (growth - 1)) / r);
}

/** El aporte mensual (en dólares enteros, para arriba) con que se llega a `target` en el plazo, con el rendimiento elegido. */
export function monthlyNeeded(input: { initial: number; target: number; years: number; annualRate: number }): number {
  const n = Math.round(input.years * 12);
  if (n <= 0) return 0;
  const r = input.annualRate / 12;
  const growth = r === 0 ? 1 : (1 + r) ** n;
  const factor = r === 0 ? n : (growth - 1) / r;
  return Math.max(0, Math.ceil((input.target - input.initial * growth) / factor));
}

/** "Aportando USD 200 por mes durante 5 años, con un 5 % anual, llegarías a ≈ USD 17.600". */
export function simulateGoal(goal: InvestmentGoal, s: SimulationAssumptions): { projected: number; shortfall: number } {
  const projected = futureValue({ initial: goal.savedUsd, monthly: s.monthlyUsd, years: s.years, annualRate: s.annualRate });
  return { projected, shortfall: round2(Math.max(0, goal.targetUsd - projected)) };
}
