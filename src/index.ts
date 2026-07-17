/**
 * Shared Type Definitions for High-Performance Offline Backtesting Engine
 * Professional Grade - Multi-Asset, Strategy DSL, WFO, Monte Carlo
 */

// ============================================================================
// 1. DATA PIPELINE & INGESTION TYPES
// ============================================================================

export interface ColumnIndexMap {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol?: number;
}

export interface IngestionConfig {
  hasHeader: boolean;
  delimiter: string;
  schemaMap: ColumnIndexMap;
  dateFormat: 'ISO8601' | 'EPOCH_S' | 'EPOCH_MS' | 'EPOCH_US' | string;
}

export interface ParseReport {
  totalRows: number;
  acceptedRows: number;
  anomaliesMitigated: number;
  priceBoundViolations: number;
  swingViolations: number;
  duplicateTimestamps: number;
  gapFilledBars: number;
  firstTimestamp: bigint;
  lastTimestamp: bigint;
  symbols?: string[];
}

// ============================================================================
// 2. STRATEGY DSL TYPES
// ============================================================================

export type OrderType = 'LIMIT' | 'STOP' | 'MARKET';
export type OrderSide = 'BUY' | 'SELL';

export type IndicatorType = 'sma' | 'ema' | 'rsi' | 'atr' | 'macd' | 'close' | 'open' | 'high' | 'low' | 'volume';
export type Comparator = '>' | '<' | '>=' | '<=' | '==' | '!=';
export type LogicalOp = 'and' | 'or';

export interface IndicatorNode {
  type: 'indicator';
  name: IndicatorType;
  params: number[];
}

export interface ValueNode {
  type: 'value';
  value: number;
}

export interface ConditionNode {
  type: 'condition';
  left: IndicatorNode | ValueNode;
  comparator: Comparator;
  right: IndicatorNode | ValueNode;
}

export interface ExpressionNode {
  type: 'expression';
  conditions: ConditionNode[];
  logicalOps: LogicalOp[];
}

export interface StrategyConfig {
  name: string;
  entryRules: ExpressionNode;
  exitRules: ExpressionNode;
  positionSizing: 'EQUAL_DOLLAR' | 'VOLATILITY_PARITY' | 'RISK_PERCENT';
  riskPercent?: number;
  maxPositions?: number;
  allowFractionalShares?: boolean;
  direction?: 'LONG' | 'SHORT' | 'BOTH';
}

// ============================================================================
// 3. PORTFOLIO & MULTI-ASSET TYPES
// ============================================================================

export interface PortfolioConfig {
  symbols: string[];
  weights: 'EQUAL' | 'VOLATILITY_PARITY' | 'CUSTOM' | 'CORRELATION_ADJUSTED';
  customWeights?: number[];
  rebalanceFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export interface SymbolData {
  symbol: string;
  dataFrame: ColumnarDataFrame;
  weight: number;
  correlationMap?: Map<string, number>;
}

// ============================================================================
// 4. FRICTION & COMMISSION CONFIGURATIONS
// ============================================================================

export type CommissionType = 'FLAT' | 'PER_UNIT' | 'PERCENTAGE';

export interface FrictionConfig {
  commissionType: CommissionType;
  commissionValue: number;
  slippageModel: 'ATR' | 'MARKET_IMPACT' | 'NONE' | 'PERCENTAGE' | 'FIXED_TICK';
  atrLength?: number;
  atrMultiplier?: number;
  marketImpactC?: number;
  contractMultiplier?: number;
  slippageValue?: number;
}

// ============================================================================
// 5. PERFORMANCE LEDGER & ANALYTICS MATRIX
// ============================================================================

export interface TradeRecord {
  id: number;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  entryBar: number;
  exitBar: number;
  entryTimestamp: bigint;
  exitTimestamp: bigint;
  grossPnL: number;
  commission: number;
  slippage: number;
  netPnL: number;
  strategy: string;
}

export interface PerformanceLedger {
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  maxDrawdownDurationMs: number;
  sharpeRatioAnnualized: number;
  sortinoRatioAnnualized: number;
  ulcerIndex: number;
  martinRatio: number;
  tharpExpectancy: number;
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgTrade: number;
  avgHoldingPeriodBars: number;
  trades: TradeRecord[];
}

// ============================================================================
// 6. WALK-FORWARD OPTIMIZATION TYPES
// ============================================================================

export interface WFOConfig {
  enabled: boolean;
  trainSize: number;
  testSize: number;
  stepSize: number;
  paramGrid: ParamGrid;
  optimizationMetric: 'SHARPE' | 'SORTINO' | 'PROFIT_FACTOR' | 'NET_PROFIT';
}

export interface ParamGrid {
  [paramName: string]: number[];
}

export interface WFOResult {
  windowIndex: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  bestParams: Record<string, number>;
  trainPerformance: PerformanceLedger;
  testPerformance: PerformanceLedger;
  isOverfit: boolean;
}

// ============================================================================
// 7. MONTE CARLO TYPES
// ============================================================================

export interface MonteCarloConfig {
  enabled: boolean;
  iterations: number;
  method: 'TRADE_RESHUFFLE' | 'BLOCK_BOOTSTRAP' | 'EQUITY_RESAMPLE';
  blockSize?: number;
  confidenceLevel: number;
}

export interface MonteCarloResult {
  iterations: number;
  confidenceLevel: number;
  sharpeCI: [number, number];
  sortinoCI: [number, number];
  profitFactorCI: [number, number];
  maxDrawdownCI: [number, number];
  probabilityOfRuin: number;
  probabilityOfProfit: number;
  medianFinalEquity: number;
  worstCaseEquity: number;
  bestCaseEquity: number;
  equityCurves: Float64Array[];
}

// ============================================================================
// 8. THREAD ORCHESTRATION EVENT PAYLOADS
// ============================================================================

export enum WorkerAction {
  PARSE_DATA = 'PARSE_DATA',
  RUN_BACKTEST = 'RUN_BACKTEST',
  RUN_WFO = 'RUN_WFO',
  RUN_MONTE_CARLO = 'RUN_MONTE_CARLO'
}

export enum WorkerResponse {
  PROGRESS_UPDATE = 'PROGRESS_UPDATE',
  COMPLETED_RESULT = 'COMPLETED_RESULT',
  ERROR = 'ERROR'
}

export interface WorkerMessageRequest {
  action: WorkerAction;
  payload: {
    csvData?: ArrayBuffer | string;
    config?: IngestionConfig;
    initialCapital?: number;
    friction?: FrictionConfig;
    riskPercent?: number;
    strategy?: StrategyConfig;
    portfolio?: PortfolioConfig;
    wfoConfig?: WFOConfig;
    monteCarloConfig?: MonteCarloConfig;
  };
}

export interface WorkerMessageResponse {
  type: WorkerResponse;
  progress?: number;
  payload?: {
    ledger?: PerformanceLedger;
    equityCurveBuffer?: ArrayBuffer;
    executionLogs?: string[];
    parseReport?: ParseReport;
    wfoResults?: WFOResult[];
    flattenedTestTrades?: TradeRecord[]; // BUG 3 FIX: Added flattened trades array for clean WFO aggregation
    monteCarloResult?: MonteCarloResult;
  };
  error?: string;
}

// ============================================================================
// 9. DATAFRAME
// ============================================================================

export class ColumnarDataFrame {
  public length: number;
  private buffer: ArrayBuffer;
  public timestamps: BigInt64Array;
  public open: Float64Array;
  public high: Float64Array;
  public low: Float64Array;
  public close: Float64Array;
  public volume: Float64Array; // PHASE 4 FIX: Upgraded from Float32Array to Float64Array
  public symbol?: string;

  constructor(size: number) {
    this.length = size;
    // PHASE 4 FIX: Changed the last '4' to '8' (8 bytes for timestamps, 8 for O, 8 for H, 8 for L, 8 for C, 8 for V)
    const bytesPerRow = 8 + 8 + 8 + 8 + 8 + 8; 
    this.buffer = new ArrayBuffer(size * bytesPerRow);
    let offset = 0;
    
    this.timestamps = new BigInt64Array(this.buffer, offset, size);
    offset += size * 8;
    
    this.open = new Float64Array(this.buffer, offset, size);
    offset += size * 8;
    
    this.high = new Float64Array(this.buffer, offset, size);
    offset += size * 8;
    
    this.low = new Float64Array(this.buffer, offset, size);
    offset += size * 8;
    
    this.close = new Float64Array(this.buffer, offset, size);
    offset += size * 8;
    
    // PHASE 4 FIX: Upgraded to Float64Array to preserve Crypto micro-fractions (e.g., 0.00001234 BTC)
    this.volume = new Float64Array(this.buffer, offset, size); 
  }

  public setRow(index: number, timestampMs: bigint, o: number, h: number, l: number, c: number, v: number): void {
    if (index < 0 || index >= this.length) throw new RangeError(`Index ${index} out of bounds`);
    this.timestamps[index] = timestampMs;
    this.open[index] = o;
    this.high[index] = h;
    this.low[index] = l;
    this.close[index] = c;
    this.volume[index] = v;
  }

  public getRow(index: number) {
    if (index < 0 || index >= this.length) throw new RangeError(`Index ${index} out of bounds`);
    return {
      timestamp: this.timestamps[index],
      open: this.open[index],
      high: this.high[index],
      low: this.low[index],
      close: this.close[index],
      volume: this.volume[index],
    };
  }

  public getUnderlyingBuffer(): ArrayBuffer {
    return this.buffer;
  }
}

// ============================================================================
// 10. STRATEGY TEMPLATES
// ============================================================================

export const STRATEGY_TEMPLATES: Record<string, StrategyConfig> = {
  'SMA Crossover': {
    name: 'SMA Crossover',
    entryRules: {
      type: 'expression',
      conditions: [
        {
          type: 'condition',
          left: { type: 'indicator', name: 'sma', params: [20] },
          comparator: '>',
          right: { type: 'indicator', name: 'sma', params: [50] }
        }
      ],
      logicalOps: []
    },
    exitRules: {
      type: 'expression',
      conditions: [
        {
          type: 'condition',
          left: { type: 'indicator', name: 'sma', params: [20] },
          comparator: '<',
          right: { type: 'indicator', name: 'sma', params: [50] }
        }
      ],
      logicalOps: []
    },
    positionSizing: 'EQUAL_DOLLAR',
    direction: 'LONG'
  },
  'RSI Oversold': {
    name: 'RSI Oversold',
    entryRules: {
      type: 'expression',
      conditions: [
        {
          type: 'condition',
          left: { type: 'indicator', name: 'rsi', params: [14] },
          comparator: '<',
          right: { type: 'value', value: 30 }
        }
      ],
      logicalOps: []
    },
    exitRules: {
      type: 'expression',
      conditions: [
        {
          type: 'condition',
          left: { type: 'indicator', name: 'rsi', params: [14] },
          comparator: '>',
          right: { type: 'value', value: 70 }
        }
      ],
      logicalOps: []
    },
    positionSizing: 'RISK_PERCENT',
    riskPercent: 0.01, // FIXED: Changed from 1.0 to 0.01 so UI displays "1.00%" instead of "100.00%"
    direction: 'LONG'
  },
  'MACD Momentum': {
    name: 'MACD Momentum',
    entryRules: {
      type: 'expression',
      conditions: [
        {
          type: 'condition',
          left: { type: 'indicator', name: 'macd', params: [12, 26, 9] },
          comparator: '>',
          right: { type: 'value', value: 0 }
        }
      ],
      logicalOps: []
    },
    exitRules: {
      type: 'expression',
      conditions: [
        {
          type: 'condition',
          left: { type: 'indicator', name: 'macd', params: [12, 26, 9] },
          comparator: '<',
          right: { type: 'value', value: 0 }
        }
      ],
      logicalOps: []
    },
    positionSizing: 'VOLATILITY_PARITY',
    riskPercent: 0.01, // ADDED: For explicit consistency with the 1% risk target
    direction: 'LONG'
  }
};

// ============================================================================
// 11. ORDER & POSITION TYPES
// ============================================================================

export interface Order {
  id: number;
  active: boolean;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  price: number;
  quantity: number;
  timestamp?: bigint;
  filled?: boolean;
}

export interface Position {
  id: number;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  entryBar: number;
  entryTimestamp: bigint;
  stopLossPrice: number;
  takeProfitPrice: number;
  unrealizedPnL?: number;
}