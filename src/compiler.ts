import { PerformanceLedger } from './types';

/**
 * High-Performance Quantitative Analytics Matrix Compiler.
 * Scans continuous binary equity vectors to compute risk/reward statistics.
 */
export class AnalyticsCompiler {

  public static compile(
    equityCurve: Float64Array,
    initialCapital: number,
    totalWins: number,
    totalLosses: number,
    winningPnL: number,
    losingPnL: number,
    tradePnLs: number[],
    dataFrequency: 'DAILY' | 'MINUTELY' = 'DAILY'
  ): PerformanceLedger {
    const len = equityCurve.length;
    if (len === 0) {
      return this.generateEmptyLedger();
    }

    const netProfit = equityCurve[len - 1] - initialCapital;
    const profitFactor = losingPnL === 0 ? winningPnL : winningPnL / losingPnL;

    const stepIntervalMs = dataFrequency === 'DAILY' ? (24 * 60 * 60 * 1000) : 60000;
    const stepsPerYear = dataFrequency === 'DAILY' ? 252 : (252 * 6.5 * 60);

    let peak = initialCapital;
    let maxDrawdownPercent = 0;
    let maxDrawdownDurationMs = 0;
    let currentDrawdownDurationCount = 0;
    let squareDrawdownSum = 0;

    for (let i = 0; i < len; i++) {
      const equity = equityCurve[i];

      if (equity > peak) {
        peak = equity;
        if (currentDrawdownDurationCount > maxDrawdownDurationMs) {
          maxDrawdownDurationMs = currentDrawdownDurationCount;
        }
        currentDrawdownDurationCount = 0;
      } else {
        currentDrawdownDurationCount += stepIntervalMs;
      }

      const drawdownPercent = ((peak - equity) / peak) * 100;
      if (drawdownPercent > maxDrawdownPercent) {
        maxDrawdownPercent = drawdownPercent;
      }
      squareDrawdownSum += (drawdownPercent * drawdownPercent);
    }

    if (currentDrawdownDurationCount > maxDrawdownDurationMs) {
      maxDrawdownDurationMs = currentDrawdownDurationCount;
    }

    const ulcerIndex = len === 0 ? 0 : Math.sqrt(squareDrawdownSum / len);

    let sumReturns = 0;
    for (let i = 1; i < len; i++) {
      sumReturns += (equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1];
    }
    const meanReturn = len <= 1 ? 0 : sumReturns / (len - 1);

    let sumVarianceSquared = 0;
    let sumDownsideVarianceSquared = 0;

    for (let i = 1; i < len; i++) {
      const periodicReturn = (equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1];
      const diff = periodicReturn - meanReturn;
      sumVarianceSquared += (diff * diff);
      if (periodicReturn < 0) {
        sumDownsideVarianceSquared += (periodicReturn * periodicReturn);
      }
    }

    const standardVariance = len <= 2 ? 0 : sumVarianceSquared / (len - 1);
    const standardDeviation = Math.sqrt(standardVariance);
    const downsideVariance = len <= 2 ? 0 : sumDownsideVarianceSquared / (len - 1);
    const downsideDeviation = Math.sqrt(downsideVariance);

    const annualizedReturn = meanReturn * stepsPerYear;
    const annualizedVol = Math.max(standardDeviation * Math.sqrt(stepsPerYear), 1e-9);
    const annualizedDownsideVol = Math.max(downsideDeviation * Math.sqrt(stepsPerYear), 1e-9);

    const riskFreeRate = 0.0;
    const sharpeRatio = annualizedVol === 0 ? 0 : (annualizedReturn - riskFreeRate) / annualizedVol;
    const sortinoRatio = annualizedDownsideVol === 0 ? 0 : (annualizedReturn - riskFreeRate) / annualizedDownsideVol;
    const martinRatio = ulcerIndex === 0 ? 0 : annualizedReturn / ulcerIndex;

    const totalTrades = totalWins + totalLosses;
    let tharpExpectancy = 0;

    if (totalTrades > 0 && tradePnLs.length > 0) {
      let absoluteLossSum = 0;
      for (let i = 0; i < tradePnLs.length; i++) {
        if (tradePnLs[i] < 0) {
          absoluteLossSum += Math.abs(tradePnLs[i]);
        }
      }
      const averageLossR = totalLosses === 0 ? 1.0 : absoluteLossSum / totalLosses;
      let totalRProfitScore = 0;
      for (let i = 0; i < tradePnLs.length; i++) {
        totalRProfitScore += (tradePnLs[i] / averageLossR);
      }
      tharpExpectancy = totalRProfitScore / totalTrades;
    }

    return {
      grossProfit: winningPnL,
      grossLoss: losingPnL,
      netProfit: netProfit,
      profitFactor: profitFactor,
      maxDrawdownPercent: maxDrawdownPercent,
      maxDrawdownDurationMs: maxDrawdownDurationMs,
      sharpeRatioAnnualized: sharpeRatio,
      sortinoRatioAnnualized: sortinoRatio,
      ulcerIndex: ulcerIndex,
      martinRatio: martinRatio,
      tharpExpectancy: tharpExpectancy,
      totalTrades: totalTrades,
      winRate: totalTrades > 0 ? totalWins / totalTrades : 0,
      avgWin: totalWins > 0 ? winningPnL / totalWins : 0,
      avgLoss: totalLosses > 0 ? losingPnL / totalLosses : 0,
      largestWin: Math.max(...tradePnLs.filter(p => p > 0), 0),
      largestLoss: Math.min(...tradePnLs.filter(p => p < 0), 0),
      avgTrade: totalTrades > 0 ? (winningPnL - losingPnL) / totalTrades : 0,
      avgHoldingPeriodBars: 0,
      trades: []
    };
  }

  private static generateEmptyLedger(): PerformanceLedger {
    return {
      grossProfit: 0,
      grossLoss: 0,
      netProfit: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      maxDrawdownDurationMs: 0,
      sharpeRatioAnnualized: 0,
      sortinoRatioAnnualized: 0,
      ulcerIndex: 0,
      martinRatio: 0,
      tharpExpectancy: 0,
      totalTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      avgTrade: 0,
      avgHoldingPeriodBars: 0,
      trades: []
    };
  }
}
