import { StreamingParser } from '../pipeline/parser';
import { SimulationEngine } from '../execution/engine';
import { AnalyticsCompiler } from '../analytics/compiler';
import { ColumnarDataFrame } from '../pipeline/dataframe';
import { WalkForwardOptimizer } from '../optimization/wfo';
import { MonteCarloEngine } from '../montecarlo/montecarlo';
import { WorkerAction, WorkerResponse, WorkerMessageRequest, IngestionConfig, PerformanceLedger } from '../types';

interface WorkerCtx {
  onmessage: ((ev: MessageEvent<any>) => void) | null;
  postMessage(message: any, transfer?: Transferable[]): void;
}

const ctx = self as unknown as WorkerCtx;
let cachedDataFrame: ColumnarDataFrame | null = null;
let cachedLedger: PerformanceLedger | null = null;
let cachedInitialCapital: number = 100000;

function ensureDataFrame(payload: WorkerMessageRequest['payload']): ColumnarDataFrame {
  if (cachedDataFrame) return cachedDataFrame;
  const { csvData, config } = payload;
  if (!csvData || !(csvData instanceof ArrayBuffer)) throw new Error("Ingestion Error: Expected a raw ArrayBuffer.");
  const baseConfig: IngestionConfig = config || { hasHeader: true, delimiter: ',', schemaMap: { timestamp: -1, open: -1, high: -1, low: -1, close: -1, volume: -1 }, dateFormat: 'ISO8601' };
  if (baseConfig.schemaMap.timestamp === -1) baseConfig.schemaMap = StreamingParser.discoverSchema(csvData, baseConfig.delimiter);
  const parser = new StreamingParser(baseConfig);
  cachedDataFrame = parser.parse(csvData, (progressPercent) => { sendProgressResponse(progressPercent); });
  return cachedDataFrame;
}

ctx.onmessage = function (event: MessageEvent<WorkerMessageRequest>) {
  const { action, payload } = event.data;
  try {
    switch (action) {
      case WorkerAction.PARSE_DATA: handleParseData(payload); break;
      case WorkerAction.RUN_BACKTEST: handleRunBacktest(payload); break;
      case WorkerAction.RUN_WFO: handleRunWFO(payload); break;
      case WorkerAction.RUN_MONTE_CARLO: handleRunMonteCarlo(payload); break;
      default: sendErrorResponse(`Execution Engine Error: Unrecognized action target "${String(action)}".`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "An unhandled systemic worker error occurred.";
    sendErrorResponse(msg);
  }
};

function handleParseData(payload: WorkerMessageRequest['payload']): void {
  const { csvData, config } = payload;
  if (!csvData || !(csvData instanceof ArrayBuffer)) throw new Error("Ingestion Error: Expected a raw ArrayBuffer.");
  const baseConfig: IngestionConfig = config || { hasHeader: true, delimiter: ',', schemaMap: { timestamp: -1, open: -1, high: -1, low: -1, close: -1, volume: -1 }, dateFormat: 'ISO8601' };
  if (baseConfig.schemaMap.timestamp === -1) baseConfig.schemaMap = StreamingParser.discoverSchema(csvData, baseConfig.delimiter);
  const parser = new StreamingParser(baseConfig);
  cachedDataFrame = parser.parse(csvData, (progressPercent) => { sendProgressResponse(progressPercent); });
  const parseReport = (cachedDataFrame as unknown as { parseReport?: object }).parseReport || {};
  ctx.postMessage({ type: WorkerResponse.COMPLETED_RESULT, progress: 100.0, payload: { executionLogs: [`Ingestion parsed successfully over ${cachedDataFrame.length} steps.`], parseReport } });
}

function handleRunBacktest(payload: WorkerMessageRequest['payload']): void {
  const { initialCapital, friction, riskPercent, strategy } = payload;
  const df = ensureDataFrame(payload);
  const startingBalance = initialCapital || 100000;
  const standardFriction = friction || { commissionType: 'FLAT' as const, commissionValue: 4.95, slippageModel: 'ATR' as const, atrLength: 14, atrMultiplier: 0.2 };
  let baselineRisk = riskPercent !== undefined ? riskPercent : 0.01;
  if (!Number.isFinite(baselineRisk)) baselineRisk = 0.01;
  if (baselineRisk > 1.0) baselineRisk = baselineRisk / 100;
  const strategyConfig = strategy || { name: 'SMA Crossover', entryRules: { type: 'expression' as const, conditions: [{ type: 'condition' as const, left: { type: 'indicator' as const, name: 'close' as const, params: [] }, comparator: '>' as const, right: { type: 'indicator' as const, name: 'sma' as const, params: [20] } }], logicalOps: [] }, exitRules: { type: 'expression' as const, conditions: [{ type: 'condition' as const, left: { type: 'indicator' as const, name: 'close' as const, params: [] }, comparator: '<' as const, right: { type: 'indicator' as const, name: 'sma' as const, params: [20] } }], logicalOps: [] }, positionSizing: 'RISK_PERCENT' as const, riskPercent: baselineRisk };

  const engine = new SimulationEngine(df, startingBalance, standardFriction, baselineRisk, strategyConfig);
  const totalBars = df.length;
  const curve = engine.runSimulation((pct) => { sendProgressResponse(pct); });
  const tradePnLs = engine.getTradePnLs();
  const tradeRecords = engine.getTradeRecords();
  const wins = tradePnLs.filter(p => p > 0).length;
  const losses = tradePnLs.filter(p => p <= 0).length;
  const winPnL = tradePnLs.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const lossPnL = Math.abs(tradePnLs.filter(p => p <= 0).reduce((a, b) => a + b, 0));

  const compiledLedger = AnalyticsCompiler.compile(curve, startingBalance, wins, losses, winPnL, lossPnL, tradePnLs, 'DAILY');
  compiledLedger.trades = tradeRecords;
  compiledLedger.totalTrades = wins + losses;
  compiledLedger.winRate = compiledLedger.totalTrades > 0 ? wins / compiledLedger.totalTrades : 0;
  compiledLedger.avgWin = wins > 0 ? winPnL / wins : 0;
  compiledLedger.avgLoss = losses > 0 ? lossPnL / losses : 0;
  compiledLedger.largestWin = tradePnLs.length > 0 ? Math.max(0, ...tradePnLs.filter(p => p > 0)) : 0;
  compiledLedger.largestLoss = tradePnLs.length > 0 ? Math.min(0, ...tradePnLs.filter(p => p < 0)) : 0;
  compiledLedger.avgTrade = compiledLedger.totalTrades > 0 ? (winPnL - lossPnL) / compiledLedger.totalTrades : 0;

  cachedLedger = compiledLedger;
  cachedInitialCapital = startingBalance;
  const underlyingCurveBuffer = curve.buffer;

  ctx.postMessage({ type: WorkerResponse.COMPLETED_RESULT, progress: 100.0, payload: { ledger: compiledLedger, equityCurveBuffer: underlyingCurveBuffer, executionLogs: [`Backtest completed: ${tradePnLs.length} trades over ${totalBars} bars.`] } }, [underlyingCurveBuffer]);
}

// BUG 3 FIX: Destructure and pass flattenedTestTrades
function handleRunWFO(payload: WorkerMessageRequest['payload']): void {
  const { initialCapital, friction, strategy, wfoConfig } = payload;
  const df = ensureDataFrame(payload);
  const standardFriction = friction || { commissionType: 'FLAT' as const, commissionValue: 4.95, slippageModel: 'ATR' as const, atrLength: 14, atrMultiplier: 0.2 };
  const wfo = new WalkForwardOptimizer();

  const { results, flattenedTestTrades } = wfo.run(df, wfoConfig!, strategy!, initialCapital || 100000, standardFriction);

  ctx.postMessage({
    type: WorkerResponse.COMPLETED_RESULT,
    progress: 100.0,
    payload: {
      wfoResults: results,
      flattenedTestTrades: flattenedTestTrades,
      executionLogs: [`WFO completed: ${results.length} windows analyzed.`]
    }
  });
}

function handleRunMonteCarlo(payload: WorkerMessageRequest['payload']): void {
  const { monteCarloConfig } = payload;
  if (!cachedLedger || !cachedLedger.trades) throw new Error("Monte Carlo Error: No trade history available. Run backtest first.");
  const result = MonteCarloEngine.run(cachedLedger.trades, cachedInitialCapital, cachedLedger.trades.length * 5, monteCarloConfig!);
  ctx.postMessage({ type: WorkerResponse.COMPLETED_RESULT, progress: 100.0, payload: { monteCarloResult: result, executionLogs: [`Monte Carlo completed: ${result.iterations} iterations.`] } });
}

function sendProgressResponse(pct: number): void {
  ctx.postMessage({ type: WorkerResponse.PROGRESS_UPDATE, progress: Math.min(Math.max(pct, 0.0), 99.99) });
}

function sendErrorResponse(msg: string): void {
  ctx.postMessage({ type: WorkerResponse.ERROR, error: msg });
}