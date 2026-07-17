import { WFOConfig, WFOResult, ParamGrid, PerformanceLedger, StrategyConfig, FrictionConfig, TradeRecord } from './types';
import { ColumnarDataFrame } from './pipeline/dataframe';
import { SimulationEngine } from './execution/engine';
import { AnalyticsCompiler } from './analytics/compiler';

interface Individual {
  params: Record<string, number>;
  fitness: number;
}

export class WalkForwardOptimizer {
  constructor() {}

  // PHASE GA + BUG 3 FIX: Returns both results and flattened test trades
  public run(
    data: ColumnarDataFrame,
    config: WFOConfig,
    baseStrategy: StrategyConfig,
    initialCapital: number,
    friction: FrictionConfig
  ): { results: WFOResult[], flattenedTestTrades: TradeRecord[] } {
    const results: WFOResult[] = [];
    const flattenedTestTrades: TradeRecord[] = [];
    const totalBars = data.length;
    const { trainSize, testSize, stepSize, paramGrid, optimizationMetric } = config;
    let windowIdx = 0;
    let trainStart = 0;

    while (trainStart + trainSize + testSize <= totalBars) {
      const trainEnd = trainStart + trainSize;
      const testStart = trainEnd;
      const testEnd = Math.min(testStart + testSize, totalBars);
      
      const trainData = this.extractWindow(data, trainStart, trainEnd);
      
      // PHASE GA: Replaced gridSearch with geneticSearch
      const bestParams = this.geneticSearch(
        trainData, paramGrid, baseStrategy, initialCapital, friction, optimizationMetric
      );
      
      const testData = this.extractWindow(data, testStart, testEnd);
      const testLedger = this.runBacktest(testData, bestParams, baseStrategy, initialCapital, friction);
      const trainLedger = this.runBacktest(trainData, bestParams, baseStrategy, initialCapital, friction);
      
      // BUG 3 FIX: Only keep trades that fully close within the test window
      const validTestTrades = testLedger.trades.filter(t => t.exitBar < testData.length);
      testLedger.trades = validTestTrades;
      flattenedTestTrades.push(...validTestTrades);

      const isOverfit = trainLedger.sharpeRatioAnnualized > testLedger.sharpeRatioAnnualized * 2;
      
      results.push({
        windowIndex: windowIdx,
        trainStart, trainEnd, testStart, testEnd,
        bestParams,
        trainPerformance: trainLedger,
        testPerformance: testLedger,
        isOverfit
      });
      
      trainStart += stepSize;
      windowIdx++;
    }
    return { results, flattenedTestTrades };
  }

  // ============================================================================
  // GENETIC ALGORITHM OPTIMIZER
  // ============================================================================
  private geneticSearch(
    data: ColumnarDataFrame, paramGrid: ParamGrid, baseStrategy: StrategyConfig,
    initialCapital: number, friction: FrictionConfig, metric: string
  ): Record<string, number> {
    const keys = Object.keys(paramGrid);
    if (keys.length === 0) return {};

    const populationSize = 20; 
    const generations = 10;    
    const mutationRate = 0.15; 
    const elitismCount = 4;    

    let population: Individual[] = Array.from({ length: populationSize }, () => ({
      params: this.getRandomParams(paramGrid), fitness: -Infinity
    }));

    this.evaluatePopulation(population, data, baseStrategy, initialCapital, friction, metric);

    for (let gen = 0; gen < generations; gen++) {
      population.sort((a, b) => b.fitness - a.fitness);
      const newPopulation: Individual[] = [];

      for (let i = 0; i < elitismCount; i++) {
        newPopulation.push({ params: { ...population[i].params }, fitness: population[i].fitness });
      }

      while (newPopulation.length < populationSize) {
        const pA = this.tournamentSelect(population);
        const pB = this.tournamentSelect(population);
        let childParams = this.crossover(pA.params, pB.params, paramGrid);
        childParams = this.mutate(childParams, paramGrid, mutationRate);
        newPopulation.push({ params: childParams, fitness: -Infinity });
      }

      this.evaluatePopulation(newPopulation.slice(elitismCount), data, baseStrategy, initialCapital, friction, metric);
      population = newPopulation;
    }

    population.sort((a, b) => b.fitness - a.fitness);
    return population[0].params;
  }

  private getRandomParams(paramGrid: ParamGrid): Record<string, number> {
    const params: Record<string, number> = {};
    for (const key of Object.keys(paramGrid)) {
      const options = paramGrid[key];
      params[key] = options[Math.floor(Math.random() * options.length)];
    }
    return params;
  }

  private evaluatePopulation(pop: Individual[], data: ColumnarDataFrame, baseStrategy: StrategyConfig, initialCapital: number, friction: FrictionConfig, metric: string): void {
    for (const ind of pop) {
      if (ind.fitness === -Infinity) {
        const ledger = this.runBacktest(data, ind.params, baseStrategy, initialCapital, friction);
        ind.fitness = this.extractMetric(ledger, metric);
      }
    }
  }

  private tournamentSelect(population: Individual[]): Individual {
    let best: Individual | null = null;
    for (let i = 0; i < 3; i++) {
      const contender = population[Math.floor(Math.random() * population.length)];
      if (!best || contender.fitness > best.fitness) best = contender;
    }
    return best!;
  }

  private crossover(pA: Record<string, number>, pB: Record<string, number>, paramGrid: ParamGrid): Record<string, number> {
    const child: Record<string, number> = {};
    for (const key of Object.keys(paramGrid)) child[key] = Math.random() < 0.5 ? pA[key] : pB[key];
    return child;
  }

  private mutate(params: Record<string, number>, paramGrid: ParamGrid, rate: number): Record<string, number> {
    for (const key of Object.keys(paramGrid)) {
      if (Math.random() < rate) {
        const options = paramGrid[key];
        params[key] = options[Math.floor(Math.random() * options.length)];
      }
    }
    return params;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================
  private buildStrategy(base: StrategyConfig, params: Record<string, number>): StrategyConfig {
    const strategy = JSON.parse(JSON.stringify(base));
    for (const [key, value] of Object.entries(params)) {
      if (key === 'smaPeriod' || key === 'period') {
        strategy.entryRules = this.substituteParam(strategy.entryRules, 'sma', value);
        strategy.exitRules = this.substituteParam(strategy.exitRules, 'sma', value);
      }
      if (key === 'rsiThreshold') {
        strategy.entryRules = this.substituteParam(strategy.entryRules, 'rsi', value, true);
        strategy.exitRules = this.substituteParam(strategy.exitRules, 'rsi', value, true);
      }
    }
    return strategy;
  }

  private substituteParam(expr: unknown, indicatorName: string, value: number, isThreshold: boolean = false): unknown {
    const clone = JSON.parse(JSON.stringify(expr));
    const walk = (node: any): void => {
      if (node.type === 'indicator' && node.name === indicatorName && !isThreshold) node.params = [value];
      if (node.type === 'condition') {
        if (isThreshold && node.right && node.right.type === 'value') node.right.value = value;
        walk(node.left); walk(node.right);
      }
      if (node.type === 'expression') node.conditions.forEach(walk);
    };
    walk(clone);
    return clone;
  }

  private extractMetric(ledger: PerformanceLedger, metric: string): number {
    switch (metric) {
      case 'SHARPE': return ledger.sharpeRatioAnnualized;
      case 'SORTINO': return ledger.sortinoRatioAnnualized;
      case 'PROFIT_FACTOR': return ledger.profitFactor;
      case 'NET_PROFIT': return ledger.netProfit;
      default: return ledger.sharpeRatioAnnualized;
    }
  }

  private runBacktest(data: ColumnarDataFrame, params: Record<string, number>, baseStrategy: StrategyConfig, initialCapital: number, friction: FrictionConfig): PerformanceLedger {
    const strategy = this.buildStrategy(baseStrategy, params);
    const engine = new SimulationEngine(data, initialCapital, friction, strategy.riskPercent || 0.01, strategy);
    const curve = engine.runSimulation(() => {});
    const tradePnLs = engine.getTradePnLs();
    const tradeRecords = engine.getTradeRecords();
    
    const wins = tradePnLs.filter(p => p > 0).length;
    const losses = tradePnLs.filter(p => p <= 0).length;
    const winPnL = tradePnLs.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const lossPnL = Math.abs(tradePnLs.filter(p => p <= 0).reduce((a, b) => a + b, 0));
    
    const ledger = AnalyticsCompiler.compile(curve, initialCapital, wins, losses, winPnL, lossPnL, tradePnLs, 'DAILY');
    ledger.trades = tradeRecords;
    ledger.totalTrades = tradeRecords.length;
    ledger.winRate = ledger.totalTrades > 0 ? wins / ledger.totalTrades : 0;
    ledger.avgWin = wins > 0 ? winPnL / wins : 0;
    ledger.avgLoss = losses > 0 ? lossPnL / losses : 0;
    ledger.largestWin = tradePnLs.length > 0 ? Math.max(0, ...tradePnLs.filter(p => p > 0)) : 0;
    ledger.largestLoss = tradePnLs.length > 0 ? Math.min(0, ...tradePnLs.filter(p => p < 0)) : 0;
    ledger.avgTrade = ledger.totalTrades > 0 ? (winPnL - lossPnL) / ledger.totalTrades : 0;
    
    return ledger;
  }

  private extractWindow(data: ColumnarDataFrame, start: number, end: number): ColumnarDataFrame {
    const size = end - start;
    const window = new ColumnarDataFrame(size);
    for (let i = 0; i < size; i++) {
      const row = data.getRow(start + i);
      window.setRow(i, row.timestamp, row.open, row.high, row.low, row.close, row.volume);
    }
    return window;
  }
}