import { describe, it, expect } from 'vitest';
import { ColumnarDataFrame } from './pipeline/dataframe';
import { StreamingParser } from './pipeline/parser';
import { SimulationEngine } from './execution/engine';
import { AnalyticsCompiler } from './analytics/compiler';
import { IngestionConfig, FrictionConfig, StrategyConfig } from './types';

describe('ColumnarDataFrame', () => {
  it('should allocate correct buffer size for Float64 precision', () => {
    const df = new ColumnarDataFrame(100);
    expect(df.length).toBe(100);
    // PHASE 4 FIX: Volume is now Float64 (8 bytes). 
    // 8(Timestamp) + 8(Open) + 8(High) + 8(Low) + 8(Close) + 8(Volume) = 48 bytes per row.
    expect(df.getUnderlyingBuffer().byteLength).toBe(100 * 48);
  });

  it('should set and get rows correctly with high precision', () => {
    const df = new ColumnarDataFrame(10);
    // Testing micro-fractions for Crypto/Forex support
    df.setRow(0, 1000000000000n, 100.5, 101.2, 99.8, 100.8, 0.00001234);

    const row = df.getRow(0);
    expect(row.timestamp).toBe(1000000000000n);
    expect(row.open).toBe(100.5);
    expect(row.volume).toBe(0.00001234); // Would fail with Float32
  });

  it('should throw on out of bounds access', () => {
    const df = new ColumnarDataFrame(5);
    expect(() => df.getRow(5)).toThrow(RangeError);
    expect(() => df.setRow(5, 0n, 0, 0, 0, 0, 0)).toThrow(RangeError);
  });
});

describe('StreamingParser', () => {
  const createCSVBuffer = (content: string): ArrayBuffer => {
    const encoder = new TextEncoder();
    return encoder.encode(content).buffer;
  };

  it('should parse CSV with currency symbols ($) correctly', () => {
    // PHASE 4 FIX: Testing the robust fastParseFloat
    const csv = `timestamp,open,high,low,close,volume
2023-01-01,$100.0,$101.0,$99.0,$100.5,1000`;

    const buffer = createCSVBuffer(csv);
    const config: IngestionConfig = {
      hasHeader: true,
      delimiter: ',',
      schemaMap: { timestamp: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 },
      dateFormat: 'ISO8601'
    };

    const parser = new StreamingParser(config);
    const df = parser.parse(buffer, () => {});
    
    expect(df.close[0]).toBe(100.5);
    expect(df.open[0]).toBe(100.0);
  });

  it('should handle missing volume (Forex) gracefully', () => {
    const csv = `timestamp,open,high,low,close,volume
2023-01-01,1.0500,1.0501,1.0499,1.0500,`;

    const buffer = createCSVBuffer(csv);
    const config: IngestionConfig = {
      hasHeader: true,
      delimiter: ',',
      schemaMap: { timestamp: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 },
      dateFormat: 'ISO8601'
    };

    const parser = new StreamingParser(config);
    const df = parser.parse(buffer, () => {});
    
    expect(df.volume[0]).toBe(0); // Should default to 0, not NaN
  });

  it('should discover schema from standard OHLCV headers', () => {
    const csv = 'timestamp,open,high,low,close,volume\n';
    const buffer = createCSVBuffer(csv);
    const schema = StreamingParser.discoverSchema(buffer);
    expect(schema.close).toBe(4);
  });
});

describe('SimulationEngine - Multi-Asset Features', () => {
  const createSimpleData = (bars: number): ColumnarDataFrame => {
    const df = new ColumnarDataFrame(bars);
    for (let i = 0; i < bars; i++) {
      df.setRow(i, BigInt(i * 86400000), 100 + i, 101 + i, 99 + i, 100 + i, 1000);
    }
    return df;
  };

    it('PHASE 1: should execute fractional shares for Crypto', () => {
    const df = createSimpleData(100);
    const friction: FrictionConfig = {
      commissionType: 'PERCENTAGE', commissionValue: 10, slippageModel: 'NONE'
    };
    
    const strategy: StrategyConfig = {
      name: 'CryptoTest',
      // Use a condition the DSL evaluator definitively understands
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
      exitRules: { type: 'expression', conditions: [], logicalOps: [] },
      positionSizing: 'RISK_PERCENT',
      riskPercent: 0.001, // 0.1% risk on $10,000 = $10. At price ~100, that's 0.1 shares.
      allowFractionalShares: true // PHASE 1 ENABLED
    };

    const engine = new SimulationEngine(df, 10000, friction, 0.001, strategy);
    engine.runSimulation(() => {});
    
    const positions = engine.getActivePositions();
    
    // 1. Verify a position was opened
    expect(positions.length).toBeGreaterThan(0);
    
    // 2. Verify it executed a fractional amount (between 0 and 1 share)
    // This proves Math.floor() was successfully bypassed
    expect(positions[0].quantity).toBeGreaterThan(0);
    expect(positions[0].quantity).toBeLessThan(1);
  });

  it('PHASE 2: should apply contract multiplier for Futures', () => {
    const df = createSimpleData(10);
    const friction: FrictionConfig = {
      commissionType: 'FLAT', commissionValue: 5, slippageModel: 'NONE',
      contractMultiplier: 100 // PHASE 2: Gold/Oil Multiplier
    };

    const strategy: StrategyConfig = {
      name: 'FuturesTest',
      entryRules: { type: 'expression', conditions: [{ type: 'condition', left: { type: 'value', value: 0 }, comparator: '>', right: { type: 'value', value: -1 } }], logicalOps: [] },
      exitRules: { type: 'expression', conditions: [], logicalOps: [] },
      positionSizing: 'EQUAL_DOLLAR'
    };

    const engine = new SimulationEngine(df, 100000, friction, 0.01, strategy);
    
    // Manually trigger a trade to check cash deduction
    engine.submitOrder('GC', 'MARKET', 'BUY', 100, 1);
    engine.matchOrders(100, 101, 99, 100, 0);
    
    // Cash should drop by (Price * Qty * Multiplier) + Commission
    // 100 * 1 * 100 + 5 = 10005
    expect(engine.getCash()).toBe(100000 - 10005);
  });

  it('PHASE 3: should calculate percentage-based slippage for Crypto', () => {
    const df = createSimpleData(10);
    const friction: FrictionConfig = {
      commissionType: 'FLAT', commissionValue: 0, 
      slippageModel: 'PERCENTAGE', slippageValue: 1.0 // 1% slippage
    };

    const engine = new SimulationEngine(df, 10000, friction, 0.01);
    
    engine.submitOrder('BTC', 'MARKET', 'BUY', 100, 10);
    engine.matchOrders(100, 101, 99, 100, 0);
    
    const pos = engine.getActivePositions()[0];
    // Entry price should be 100 + 1% slippage = 101
    expect(pos.entryPrice).toBeCloseTo(101, 1);
  });
});

describe('End-to-End Integration', () => {
  it('should run full pipeline: parse -> simulate -> compile', () => {
    const rows = [];
    rows.push('timestamp,open,high,low,close,volume');
    let price = 100;
    for (let i = 0; i < 200; i++) {
      const open = price;
      const close = price + (Math.random() * 4 - 1.8);
      const high = Math.max(open, close) + Math.random();
      const low = Math.min(open, close) - Math.random();
      const date = new Date(2023, 0, 1 + i).toISOString();
      rows.push(`${date},${open.toFixed(2)},${high.toFixed(2)},${low.toFixed(2)},${close.toFixed(2)},${1000 + i}`);
      price = close;
    }

    const csv = rows.join('\n');
    const encoder = new TextEncoder();
    const buffer = encoder.encode(csv).buffer;

    const config: IngestionConfig = {
      hasHeader: true,
      delimiter: ',',
      schemaMap: { timestamp: -1, open: -1, high: -1, low: -1, close: -1, volume: -1 },
      dateFormat: 'ISO8601'
    };

    const schema = StreamingParser.discoverSchema(buffer);
    config.schemaMap = schema;

    const parser = new StreamingParser(config);
    const df = parser.parse(buffer, () => {});

    expect(df.length).toBeGreaterThan(0);

    const friction: FrictionConfig = {
      commissionType: 'FLAT',
      commissionValue: 4.95,
      slippageModel: 'ATR',
      atrLength: 14,
      atrMultiplier: 0.2
    };

    const engine = new SimulationEngine(df, 100000, friction, 0.01);
    const curve = engine.runSimulation(() => {});

    expect(curve.length).toBe(df.length);

    const tradePnLs = engine.getTradePnLs();
    const wins = tradePnLs.filter(p => p > 0).length;
    const losses = tradePnLs.filter(p => p <= 0).length;
    const winPnL = tradePnLs.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const lossPnL = Math.abs(tradePnLs.filter(p => p <= 0).reduce((a, b) => a + b, 0));

    const ledger = AnalyticsCompiler.compile(
      curve,
      100000,
      wins,
      losses,
      winPnL,
      lossPnL,
      tradePnLs,
      'DAILY'
    );

    expect(ledger.netProfit).toBeDefined();
    expect(ledger.profitFactor).toBeDefined();
    expect(ledger.sharpeRatioAnnualized).toBeDefined();
  });
});