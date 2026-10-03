export const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
export const breakevenWinRate = (rr: number) => 1 / (1 + rr);
export const requiredRR = (winRate: number) => (1 - winRate) / winRate;
export const expectancyR = (winRate: number, rr: number) => round(winRate * rr - (1 - winRate));
export const mnqContracts = (riskDollars: number, stopPoints: number) => Math.floor(riskDollars / (stopPoints * 2));
/** q^k, with the public input expressed as win probability p. */
export const lossStreakProbability = (winRate: number, length: number) => (1 - winRate) ** length;
export const atLeastOneWin = (winRate: number, attempts: number) => 1 - (1 - winRate) ** attempts;
export const bufferLossCount = (bufferDollars: number, riskDollars: number) => Math.floor(bufferDollars / riskDollars);
export function binomial(n: number, k: number) { let value = 1; for (let i = 1; i <= k; i++) value = value * (n - k + i) / i; return value; }
export function probabilityNetPositive(n: number, winRate: number, rr: number) { let sum = 0; for (let wins = 0; wins <= n; wins++) if (wins * rr - (n - wins) > 0) sum += binomial(n, wins) * winRate ** wins * (1 - winRate) ** (n - wins); return sum; }
