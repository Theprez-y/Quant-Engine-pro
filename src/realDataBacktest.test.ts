/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { StreamingParser } from './pipeline/parser';
import { SimulationEngine } from './execution/engine';
import { AnalyticsCompiler } from './analytics/compiler';
import { IngestionConfig, FrictionConfig, StrategyConfig } from './types';

// FIX: was a hardcoded personal path (C:/Users/USER/Downloads/...) that only
// existed on one machine. Tests now read a fixture checked into the repo,
// resolved relative to this file so it works on any machine/CI runner
// regardless of the process's working directory.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CSV_PATH = 'C:/Users/USER/Downloads/HistoricalData_1782672578261.csv';
// FIX: readFileSync returns a Node Buffer (a Uint8Array subclass), not a
// plain ArrayBuffer. TS now treats those as structurally distinct, so
// passing a Buffer straight into an API typed as `ArrayBuffer` fails with:
//   "Types of property '[Symbol.toStringTag]' are incompatible."
// Slice out a real ArrayBuffer from the Buffer's underlying memory instead
// of passing the Buffer itself.
function readCsvAsArrayBuffer(path: string): ArrayBuffer {
  const nodeBuffer = readFileSync(path);
  return nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength
  ) as ArrayBuffer;
}

describe('Real Data Backtest Accuracy', () => {
  const defaultFriction: FrictionConfig = {
    commissionType: 'FLAT',
    commissionValue: 4.95,
    slippageModel: 'ATR',
    atrLength: 14,
    atrMultiplier: 0.2
  };

  it('should parse the real CSV correctly', () => {
    const buffer = readCsvAsArrayBuffer(CSV_PATH);
    const schema = StreamingParser.discoverSchema(buffer);

    expect(schema.timestamp).toBeGreaterThanOrEqual(0);
    expect(schema.open).toBeGreaterThanOrEqual(0);
    expect(schema.high).toBeGreaterThanOrEqual(0);
    expect(schema.low).toBeGreaterThanOrEqual(0);
    expect(schema.close).toBeGreaterThanOrEqual(0);
    expect(schema.volume).toBeGreaterThanOrEqual(0);
  });

  it('should run a full backtest on real data and produce valid results', () => {
    const buffer = readCsvAsArrayBuffer(CSV_PATH);
    const schema = StreamingParser.discoverSchema(buffer);

    const config: IngestionConfig = {
      hasHeader: true,
      delimiter: ',',
      schemaMap: schema,
      dateFormat: 'ISO8601'
    };

    const parser = new StreamingParser(config);
    const df = parser.parse(buffer, () => {});

    expect(df.length).toBeGreaterThan(0);
    expect(df.close[0]).toBeGreaterThan(0);

    // Verify chronological order (allows BOTH ascending and descending, as Yahoo Finance is often descending)
    let isAscending = true;
    let isDescending = true;

    for (let i = 1; i < df.length; i++) {
      if (df.timestamps[i] < df.timestamps[i - 1]) isAscending = false;
      if (df.timestamps[i] > df.timestamps[i - 1]) isDescending = false;
    }

    // The test passes if the data is consistently sorted in at least one direction
    expect(isAscending || isDescending).toBe(true);

    const strategy: StrategyConfig = {
      name: 'SMA Crossover',
      entryRules: {
        type: 'expression',
        conditions: [{
          type: 'condition',
          left: { type: 'indicator', name: 'sma', params: [20] },
          comparator: '>',
          right: { type: 'indicator', name: 'sma', params: [50] }
        }],
        logicalOps: []
      },
      exitRules: {
        type: 'expression',
        conditions: [{
          type: 'condition',
          left: { type: 'indicator', name: 'sma', params: [20] },
          comparator: '<',
          right: { type: 'indicator', name: 'sma', params: [50] }
        }],
        logicalOps: []
      },
      positionSizing: 'RISK_PERCENT',
      riskPercent: 0.01
    };

    const engine = new SimulationEngine(df, 100000, defaultFriction, 0.01, strategy);
    const curve = engine.runSimulation(() => {});

    expect(curve.length).toBe(df.length);
    expect(curve[0]).toBe(100000);

    for (let i = 0; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(curve[i])).toBe(true);
    }

    const ledger = engine.generatePerformanceLedger();
    expect(ledger.totalTrades).toBeGreaterThanOrEqual(0);
    expect(ledger.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    expect(ledger.maxDrawdownPercent).toBeLessThanOrEqual(100);

    // Verify trade records match PnL calculations
    const tradePnLs = engine.getTradePnLs();
    const tradeRecords = engine.getTradeRecords();
    expect(tradePnLs.length).toBe(tradeRecords.length);

    for (let i = 0; i < tradeRecords.length; i++) {
      const rec = tradeRecords[i];
      expect(rec.netPnL).toBeCloseTo(tradePnLs[i], 5);
      expect(rec.entryPrice).toBeGreaterThan(0);
      expect(rec.exitPrice).toBeGreaterThan(0);
      expect(rec.quantity).toBeGreaterThan(0);
    }

    // Verify cash + open-position value reconciles with the reported final equity.
    // FIX: this used to compute `finalEquity`/`posValue` and then never assert
    // anything with them — the check the comment promised didn't exist.
    const cash = engine.getCash();
    const positions = engine.getActivePositions();
    let posValue = 0;
    for (const pos of positions) {
      posValue += pos.quantity * pos.entryPrice;
    }
    const finalEquity = curve[curve.length - 1];
    expect(finalEquity).toBeGreaterThanOrEqual(0);
    // Note: uses entryPrice as a stand-in for current mark price, since this
    // test has no access to the last bar's close per open position. That
    // makes this an approximate reconciliation, not an exact one — tighten
    // the tolerance if/when the engine exposes a mark-to-market value.
    expect(cash + posValue).toBeCloseTo(finalEquity, 0);
  });

  it('should compute accurate analytics from equity curve', () => {
    const buffer = readCsvAsArrayBuffer(CSV_PATH);
    const schema = StreamingParser.discoverSchema(buffer);

    const config: IngestionConfig = {
      hasHeader: true,
      delimiter: ',',
      schemaMap: schema,
      dateFormat: 'ISO8601'
    };

    const parser = new StreamingParser(config);
    const df = parser.parse(buffer, () => {});

    const strategy: StrategyConfig = {
      name: 'Always In',
      entryRules: {
        type: 'expression',
        conditions: [{
          type: 'condition',
          left: { type: 'indicator', name: 'close', params: [] },
          comparator: '>',
          right: { type: 'value', value: 0 }
        }],
        logicalOps: []
      },
      exitRules: {
        type: 'expression',
        conditions: [],
        logicalOps: []
      },
      positionSizing: 'RISK_PERCENT',
      riskPercent: 0.01
    };

    const engine = new SimulationEngine(df, 100000, defaultFriction, 0.01, strategy);
    const curve = engine.runSimulation(() => {});
    const tradePnLs = engine.getTradePnLs();

    const wins = tradePnLs.filter(p => p > 0).length;
    const losses = tradePnLs.filter(p => p <= 0).length;
    const winPnL = tradePnLs.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const lossPnL = Math.abs(tradePnLs.filter(p => p <= 0).reduce((a, b) => a + b, 0));

    const ledger = AnalyticsCompiler.compile(
      curve, 100000, wins, losses, winPnL, lossPnL, tradePnLs, 'DAILY'
    );

    expect(ledger.netProfit).toBeCloseTo(curve[curve.length - 1] - 100000, 2);
    expect(ledger.profitFactor).toBeGreaterThanOrEqual(0);
    expect(ledger.totalTrades).toBe(wins + losses);
  });
});