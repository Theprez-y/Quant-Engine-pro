import { TradeRecord, MonteCarloConfig, MonteCarloResult } from './types';

/**
 * Monte Carlo Simulation Engine
 * Resamples trade history to estimate strategy robustness
 */
export class MonteCarloEngine {
  public static run(
    trades: TradeRecord[],
    initialCapital: number,
    totalBars: number,
    config: MonteCarloConfig
  ): MonteCarloResult {
    const iterations = config.iterations;
    const confidenceLevel = config.confidenceLevel;
    const method = config.method;
    const blockSize = config.blockSize || 20;

    const finalEquities: number[] = [];
    const sharpeRatios: number[] = [];
    const sortinoRatios: number[] = [];
    const profitFactors: number[] = [];
    const maxDrawdowns: number[] = [];
    const sampleCurves: Float64Array[] = [];

    const tradePnLs = trades.map(t => t.netPnL);

    for (let i = 0; i < iterations; i++) {
      const resampledPnLs = this.resample(tradePnLs, method, blockSize);
      const equity = this.simulateEquityCurve(resampledPnLs, initialCapital, totalBars);

      finalEquities.push(equity[equity.length - 1]);

      const returns = [];
      for (let j = 1; j < equity.length; j++) {
        returns.push((equity[j] - equity[j - 1]) / equity[j - 1]);
      }

      const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / returns.length);
      const downsideDev = Math.sqrt(returns.filter(r => r < 0).reduce((a, b) => a + b ** 2, 0) / returns.filter(r => r < 0).length || 1);

      sharpeRatios.push(stdDev > 0 ? meanReturn / stdDev * Math.sqrt(252) : 0);
      sortinoRatios.push(downsideDev > 0 ? meanReturn / downsideDev * Math.sqrt(252) : 0);

      const wins = resampledPnLs.filter(p => p > 0).reduce((a, b) => a + b, 0);
      const losses = Math.abs(resampledPnLs.filter(p => p <= 0).reduce((a, b) => a + b, 0));
      profitFactors.push(losses === 0 ? wins : wins / losses);

      let peak = initialCapital;
      let maxDD = 0;
      for (const eq of equity) {
        if (eq > peak) peak = eq;
        const dd = (peak - eq) / peak;
        if (dd > maxDD) maxDD = dd;
      }
      maxDrawdowns.push(maxDD * 100);

      if (i < 100) {
        sampleCurves.push(equity);
      }
    }

    finalEquities.sort((a, b) => a - b);
    sharpeRatios.sort((a, b) => a - b);
    sortinoRatios.sort((a, b) => a - b);
    profitFactors.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);

    const lowerIdx = Math.floor((1 - confidenceLevel) / 2 * iterations);
    const upperIdx = Math.floor((1 + confidenceLevel) / 2 * iterations);

    const profitableRuns = finalEquities.filter(e => e > initialCapital).length;
    const ruinedRuns = finalEquities.filter(e => e < initialCapital * 0.5).length;

    return {
      iterations,
      confidenceLevel,
      sharpeCI: [sharpeRatios[lowerIdx], sharpeRatios[upperIdx]],
      sortinoCI: [sortinoRatios[lowerIdx], sortinoRatios[upperIdx]],
      profitFactorCI: [profitFactors[lowerIdx], profitFactors[upperIdx]],
      maxDrawdownCI: [maxDrawdowns[lowerIdx], maxDrawdowns[upperIdx]],
      probabilityOfRuin: ruinedRuns / iterations,
      probabilityOfProfit: profitableRuns / iterations,
      medianFinalEquity: finalEquities[Math.floor(iterations / 2)],
      worstCaseEquity: finalEquities[0],
      bestCaseEquity: finalEquities[finalEquities.length - 1],
      equityCurves: sampleCurves
    };
  }

  private static resample(pnLs: number[], method: string, blockSize: number): number[] {
    if (method === 'TRADE_RESHUFFLE') {
      const shuffled = [...pnLs];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    if (method === 'BLOCK_BOOTSTRAP') {
      const result: number[] = [];
      while (result.length < pnLs.length) {
        const startIdx = Math.floor(Math.random() * pnLs.length);
        for (let i = 0; i < blockSize && result.length < pnLs.length; i++) {
          result.push(pnLs[(startIdx + i) % pnLs.length]);
        }
      }
      return result;
    }

    // EQUITY_RESAMPLE - return original
    return pnLs;
  }

  private static simulateEquityCurve(pnLs: number[], initialCapital: number, totalBars: number): Float64Array {
    const equity = new Float64Array(totalBars);
    equity[0] = initialCapital;
    let currentEquity = initialCapital;
    let tradeIdx = 0;

    for (let i = 1; i < totalBars; i++) {
      if (tradeIdx < pnLs.length) {
        currentEquity += pnLs[tradeIdx];
        tradeIdx++;
      }
      equity[i] = currentEquity;
    }

    return equity;
  }
}
