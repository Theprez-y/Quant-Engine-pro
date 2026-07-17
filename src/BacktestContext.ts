import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  WorkerAction, WorkerResponse, WorkerMessageRequest, WorkerMessageResponse,
  PerformanceLedger, IngestionConfig, FrictionConfig, StrategyConfig, WFOConfig,
  MonteCarloConfig, MonteCarloResult, WFOResult, ParseReport, STRATEGY_TEMPLATES, TradeRecord
} from './types';

interface BacktestContextType {
  isParsing: boolean;
  isProcessing: boolean;
  progress: number;
  ledger: PerformanceLedger | null;
  equityCurve: Float64Array | null;
  executionLogs: string[];
  error: string | null;
  parseReport: ParseReport | null;
  strategy: StrategyConfig;
  setStrategy: (s: StrategyConfig) => void;
  wfoConfig: WFOConfig;
  setWFOConfig: (c: WFOConfig) => void;
  monteCarloConfig: MonteCarloConfig;
  setMonteCarloConfig: (c: MonteCarloConfig) => void;
  wfoResults: WFOResult[] | null;
  flattenedTestTrades: TradeRecord[] | null; // BUG 3 FIX: Added to context
  monteCarloResult: MonteCarloResult | null;
  cachedCsvData: ArrayBuffer | null;
  ingestDataStream: (fileBuffer: ArrayBuffer, customConfig?: IngestionConfig) => void;
  executeBacktest: (initialCapital: number, friction: FrictionConfig, riskPercent: number) => void;
  runWFO: (initialCapital: number, friction: FrictionConfig) => void;
  runMonteCarlo: () => void;
  resetEngineState: () => void;
}

const BacktestContext = createContext<BacktestContextType | undefined>(undefined);

export const BacktestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ledger, setLedger] = useState<PerformanceLedger | null>(null);
  const [equityCurve, setEquityCurve] = useState<Float64Array | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parseReport, setParseReport] = useState<ParseReport | null>(null);
  const [cachedCsvData, setCachedCsvData] = useState<ArrayBuffer | null>(null);
  const [strategy, setStrategy] = useState<StrategyConfig>(STRATEGY_TEMPLATES['SMA Crossover']);
  const [wfoConfig, setWFOConfig] = useState<WFOConfig>({ enabled: false, trainSize: 252, testSize: 63, stepSize: 21, paramGrid: { smaPeriod: [10, 20, 30] }, optimizationMetric: 'SHARPE' });
  const [monteCarloConfig, setMonteCarloConfig] = useState<MonteCarloConfig>({ enabled: false, iterations: 1000, method: 'TRADE_RESHUFFLE', blockSize: 20, confidenceLevel: 0.95 });
  const [wfoResults, setWfoResults] = useState<WFOResult[] | null>(null);
  const [flattenedTestTrades, setFlattenedTestTrades] = useState<TradeRecord[] | null>(null); // BUG 3 FIX
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  
  const workerRef = useRef<Worker | null>(null);

  const finishWorkWithError = useCallback((message: string, shouldResetWorker = false) => {
    console.error('[Worker Error]', message);
    setError(message); setProgress(0); setIsParsing(false); setIsProcessing(false);
    if (shouldResetWorker && workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  }, []);

  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL('./worker/engine_worker.ts', import.meta.url), { type: 'module' });
      workerRef.current.onmessage = (event: MessageEvent<WorkerMessageResponse>) => {
        const { type, progress: responseProgress, payload, error: workerError } = event.data;
        switch (type) {
          case WorkerResponse.PROGRESS_UPDATE:
            if (responseProgress !== undefined) setProgress(responseProgress);
            break;
          case WorkerResponse.COMPLETED_RESULT:
            setProgress(100.0); setIsParsing(false); setIsProcessing(false);
            if (payload?.equityCurveBuffer) setEquityCurve(new Float64Array(payload.equityCurveBuffer));
            if (payload?.ledger) setLedger(payload.ledger);
            if (payload?.executionLogs) setExecutionLogs(prev => [...prev, ...payload.executionLogs!]);
            if (payload?.parseReport) setParseReport(payload.parseReport as ParseReport);
            if (payload?.wfoResults) setWfoResults(payload.wfoResults);
            if (payload?.flattenedTestTrades) setFlattenedTestTrades(payload.flattenedTestTrades); // BUG 3 FIX
            if (payload?.monteCarloResult) setMonteCarloResult(payload.monteCarloResult);
            break;
          case WorkerResponse.ERROR:
            finishWorkWithError(workerError || "An unidentified execution loop exception occurred.");
            break;
          default:
            console.warn(`[Client State Engine] Warning: Intercepted unhandled message signature: ${type}`);
        }
      };
      workerRef.current.onmessageerror = () => finishWorkWithError('The worker sent an invalid message. Please refresh the page and try again.', true);
      workerRef.current.onerror = (err) => finishWorkWithError(`Worker failed to initialize: ${err.message || 'Unknown worker error'}. Check console for details.`, true);
    } catch (err) {
      finishWorkWithError(`Failed to initialize worker: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    return () => { if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; } };
  }, [finishWorkWithError]);

  const sendWorkerRequest = useCallback((request: WorkerMessageRequest, transfer?: Transferable[]) => {
    const activeWorker = workerRef.current;
    if (!activeWorker) { finishWorkWithError('Worker is unavailable. Please refresh the page and try again.', true); return; }
    setError(null);
    try {
      if (transfer) activeWorker.postMessage(request, transfer);
      else activeWorker.postMessage(request);
    } catch (err) {
      finishWorkWithError(`Failed to send work to worker: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }, [finishWorkWithError]);

  const ingestDataStream = useCallback((fileBuffer: ArrayBuffer, customConfig?: IngestionConfig) => {
    setCachedCsvData(fileBuffer.slice(0)); setError(null); setIsParsing(true); setProgress(0);
    setExecutionLogs(["[Client System] Submitting binary ArrayBuffer to ingestion worker thread..."]);
    sendWorkerRequest({ action: WorkerAction.PARSE_DATA, payload: { csvData: fileBuffer, config: customConfig } }, [fileBuffer]);
  }, [sendWorkerRequest]);

  const executeBacktest = useCallback((initialCapital: number, friction: FrictionConfig, riskPercent: number) => {
    if (!cachedCsvData) { setError("No data loaded. Please upload a CSV file first."); return; }
    setError(null); setIsProcessing(true); setProgress(0);
    setExecutionLogs(prev => [...prev, "[Client System] Launching quantitative backtest simulation engine..."]);
    sendWorkerRequest({ action: WorkerAction.RUN_BACKTEST, payload: { csvData: cachedCsvData.slice(0), initialCapital, friction, riskPercent, strategy } }, [cachedCsvData.slice(0)]);
  }, [cachedCsvData, strategy, sendWorkerRequest]);

  const runWFO = useCallback((initialCapital: number, friction: FrictionConfig) => {
    if (!cachedCsvData) { setError("No data loaded. Please upload a CSV file first."); return; }
    setError(null); setIsProcessing(true); setProgress(0);
    setExecutionLogs(prev => [...prev, "[Client System] Launching Walk-Forward Optimization..."]);
    sendWorkerRequest({ action: WorkerAction.RUN_WFO, payload: { csvData: cachedCsvData.slice(0), initialCapital, friction, strategy, wfoConfig } }, [cachedCsvData.slice(0)]);
  }, [cachedCsvData, strategy, wfoConfig, sendWorkerRequest]);

  const runMonteCarlo = useCallback(() => {
    if (!cachedCsvData || !ledger) { setError("Run a backtest first before Monte Carlo."); return; }
    setError(null); setIsProcessing(true); setProgress(0);
    setExecutionLogs(prev => [...prev, "[Client System] Running Monte Carlo Simulation..."]);
    sendWorkerRequest({ action: WorkerAction.RUN_MONTE_CARLO, payload: { monteCarloConfig } });
  }, [ledger, monteCarloConfig, sendWorkerRequest]);

  const resetEngineState = useCallback(() => {
    setProgress(0); setLedger(null); setEquityCurve(null); setExecutionLogs([]); setError(null);
    setIsParsing(false); setIsProcessing(false); setParseReport(null); setWfoResults(null);
    setFlattenedTestTrades(null); setMonteCarloResult(null); setCachedCsvData(null); // BUG 3 FIX
  }, []);

  const value: BacktestContextType = {
    isParsing, isProcessing, progress, ledger, equityCurve, executionLogs, error, parseReport,
    strategy, setStrategy, wfoConfig, setWFOConfig, monteCarloConfig, setMonteCarloConfig,
    wfoResults, flattenedTestTrades, monteCarloResult, cachedCsvData, // BUG 3 FIX
    ingestDataStream, executeBacktest, runWFO, runMonteCarlo, resetEngineState
  };

  return React.createElement(BacktestContext.Provider, { value }, children);
};

export const useBacktest = () => {
  const context = useContext(BacktestContext);
  if (context === undefined) throw new Error("useBacktest Exception: Hook execution context must reside within an active BacktestProvider container layout.");
  return context;
};