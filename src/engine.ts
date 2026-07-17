import { ColumnarDataFrame } from './pipeline/dataframe';
import { OrderPool, PositionPool } from './pools';
import {
  Order, Position, FrictionConfig, PerformanceLedger, TradeRecord,
  OrderSide, OrderType, StrategyConfig
} from './types';
import { StrategyDSL } from './strategy/strategy.dsl';

export class SimulationEngine {
  private data: ColumnarDataFrame;
  private orderPool: OrderPool;
  private positionPool: PositionPool;
  private activeOrders: Order[];
  private activeOrdersCount: number = 0;
  private activePositions: Position[];
  private activePositionsCount: number = 0;
  private initialCapital: number;
  private currentEquity: number;
  private cash: number;
  private peakEquity: number;
  private maxDrawdownPercent: number;
  private drawdownStartBar: number = -1;
  private maxDrawdownDurationBars: number = 0;
  private equityCurve: Float64Array;
  private friction: FrictionConfig;
  private riskPercent: number;
  private tradePnLs: number[];
  private winningTradesPnL: number = 0;
  private losingTradesPnL: number = 0;
  private totalWins: number = 0;
  private totalLosses: number = 0;
  private tradeRecords: TradeRecord[] = [];
  private nextTradeId: number = 0;
  private openTradeEntries: Map<string, { barIdx: number; price: number; qty: number; commission: number; slippage: number }> = new Map();
  private strategy: StrategyConfig;
  private dsl: StrategyDSL;
  private atrValues: Float64Array;
  private atrLength: number;

  constructor(
    data: ColumnarDataFrame,
    initialCapital: number,
    friction: FrictionConfig,
    riskPercent: number = 0.01,
    strategy?: StrategyConfig
  ) {
    this.data = data;

    // CRITICAL FIX: Many CSV exports (like Yahoo Finance) are in descending order (newest first).
    // We must reverse the data to ensure chronological processing (oldest to newest).
    if (this.data.length > 1 && this.data.timestamps[0] > this.data.timestamps[this.data.length - 1]) {
      this.reverseDataChronologically();
    }

    this.initialCapital = initialCapital;
    this.currentEquity = initialCapital;
    this.cash = initialCapital;
    this.peakEquity = initialCapital;
    this.maxDrawdownPercent = 0;
    this.friction = friction;
    this.riskPercent = riskPercent;
    this.atrLength = friction.atrLength || 14;
    this.strategy = strategy || {
      name: 'SMA Crossover',
      entryRules: { type: 'expression', conditions: [], logicalOps: [] },
      exitRules: { type: 'expression', conditions: [], logicalOps: [] },
      positionSizing: 'RISK_PERCENT',
      riskPercent: 0.01
    };
    this.dsl = new StrategyDSL();
    this.orderPool = new OrderPool(5000);
    this.positionPool = new PositionPool(1000);
    this.activeOrders = new Array<Order>(5000);
    this.activePositions = new Array<Position>(1000);
    this.equityCurve = new Float64Array(data.length);
    this.tradePnLs = [];
    this.atrValues = new Float64Array(data.length);
  }

  // CRITICAL FIX: In-place reversal of typed arrays to fix time-travel bug
  private reverseDataChronologically(): void {
    const len = this.data.length;
    const half = Math.floor(len / 2);
    for (let i = 0; i < half; i++) {
      const j = len - 1 - i;

      let tempTs = this.data.timestamps[i];
      this.data.timestamps[i] = this.data.timestamps[j];
      this.data.timestamps[j] = tempTs;

      let tempO = this.data.open[i];
      this.data.open[i] = this.data.open[j];
      this.data.open[j] = tempO;

      let tempH = this.data.high[i];
      this.data.high[i] = this.data.high[j];
      this.data.high[j] = tempH;

      let tempL = this.data.low[i];
      this.data.low[i] = this.data.low[j];
      this.data.low[j] = tempL;

      let tempC = this.data.close[i];
      this.data.close[i] = this.data.close[j];
      this.data.close[j] = tempC;

      let tempV = this.data.volume[i];
      this.data.volume[i] = this.data.volume[j];
      this.data.volume[j] = tempV;
    }
  }

  public getCash(): number { return this.cash; }
  public getPortfolioValue(): number { return this.currentEquity; }
  public getActivePositionsCount(): number { return this.activePositionsCount; }
  public getActivePositions(): Position[] { return this.activePositions.slice(0, this.activePositionsCount); }
  public getTradePnLs(): number[] { return this.tradePnLs; }
  public getEquityCurve(): Float64Array { return this.equityCurve; }
  public getTradeRecords(): TradeRecord[] { return this.tradeRecords; }
  public getMaxDrawdownPercent(): number { return this.maxDrawdownPercent; }
  public getMaxDrawdownDurationBars(): number { return this.maxDrawdownDurationBars; }

  public runSimulation(onProgress: (pct: number) => void): Float64Array {
    const len = this.data.length;
    this.calculateATR();
    for (let i = 0; i < len; i++) {
      const bOpen = this.data.open[i];
      const bHigh = this.data.high[i];
      const bLow = this.data.low[i];
      const bClose = this.data.close[i];
      this.evaluateStrategy(i, bOpen, bHigh, bLow, bClose);
      this.matchOrders(bOpen, bHigh, bLow, bClose, i);
      this.manageActivePositions(bHigh, bLow, bClose, i);
      this.updatePortfolioValuation(bClose, i);
      if (i % 50000 === 0 && i > 0) onProgress((i / len) * 100);
    }
    onProgress(100.0);
    return this.equityCurve;
  }

  private calculateATR(): void {
    const len = this.data.length;
    const trueRange = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      if (i === 0) {
        trueRange[i] = this.data.high[i] - this.data.low[i];
      } else {
        trueRange[i] = Math.max(
          this.data.high[i] - this.data.low[i],
          Math.abs(this.data.high[i] - this.data.close[i - 1]),
          Math.abs(this.data.low[i] - this.data.close[i - 1])
        );
      }
    }
    let atrSum = 0;
    for (let i = 0; i < this.atrLength && i < len; i++) atrSum += trueRange[i];
    this.atrValues[this.atrLength - 1] = atrSum / this.atrLength;
    for (let i = this.atrLength; i < len; i++) {
      this.atrValues[i] = (this.atrValues[i - 1] * (this.atrLength - 1) + trueRange[i]) / this.atrLength;
    }
  }

    private calculateVolatility(barIdx: number): number {
    const window = 20;
    if (barIdx < window) return 0.01; 
    let sumLogReturns = 0;
    let sumSqLogReturns = 0;
    for (let i = barIdx - window + 1; i <= barIdx; i++) {
      const logRet = Math.log(this.data.close[i] / this.data.close[i - 1]);
      sumLogReturns += logRet;
      sumSqLogReturns += logRet * logRet;
    }
    const mean = sumLogReturns / window;
    const variance = (sumSqLogReturns / window) - (mean * mean);
    return Math.sqrt(Math.max(variance, 0.0001));
  }

        private evaluateStrategy(barIdx: number, _o: number, _h: number, _l: number, c: number): void {
    if (barIdx < 50) return;
    const data = {
      open: this.data.open, high: this.data.high,
      low: this.data.low, close: this.data.close, volume: this.data.volume
    };
    const hasPosition = this.activePositionsCount > 0;
    const riskFraction = this.normalizeRiskPercent(this.riskPercent ?? this.strategy.riskPercent);
    const allowFractional = this.strategy.allowFractionalShares || false;
    const direction = this.strategy.direction || 'LONG';

    if (!hasPosition) {
      // Simplified always-true check for testing, or use your DSL evaluator
      const shouldEnter = this.dsl.evaluate(this.strategy.entryRules, barIdx, data);
      if (shouldEnter) {
        let positionSize = 0;

        if (this.strategy.positionSizing === 'VOLATILITY_PARITY') {
          const volatility = this.calculateVolatility(barIdx);
          const dollarRisk = this.currentEquity * riskFraction;
          positionSize = dollarRisk / (c * Math.max(volatility, 0.001));
        } else {
          const availableCash = Math.max(this.cash, 0);
          const dollarRisk = availableCash * riskFraction;
          positionSize = dollarRisk / Math.max(c, 1);
        }

        // PHASE 1 FIX: Only floor if fractional trading is disabled
        if (!allowFractional) {
          positionSize = Math.floor(positionSize);
        }
        
        positionSize = Math.max(0, positionSize);

        if (positionSize > 0) {
          // PHASE 5 FIX: Direction support
          const side = direction === 'SHORT' ? 'SELL' : 'BUY';
          this.submitOrder(this.data.symbol || 'SYMBOL', 'MARKET', side, c, positionSize);
        }
      }
    } else {
      const shouldExit = this.dsl.evaluate(this.strategy.exitRules, barIdx, data);
      if (shouldExit) {
        const pos = this.activePositions[0];
        if (pos && pos.quantity > 0) {
          const coverSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
          this.submitOrder(pos.symbol, 'MARKET', coverSide, c, pos.quantity);
        }
      }
    }
  }
  public submitOrder(symbol: string, type: OrderType, side: OrderSide, price: number, quantity: number): void {
    if (this.activeOrdersCount >= this.activeOrders.length) {
      throw new Error("Execution Engine Exception: Active order array queue limit breached.");
    }
    const order = this.orderPool.obtain(symbol, type, side, price, quantity);
    this.activeOrders[this.activeOrdersCount] = order;
    this.activeOrdersCount++;
  }

  public matchOrders(o: number, h: number, l: number, c: number, barIdx: number): void {
    for (let i = 0; i < this.activeOrdersCount; i++) {
      const order = this.activeOrders[i];
      if (!order.active) continue;
      let triggerHit = false;
      let fillPrice = 0;
      if (order.type === 'MARKET') {
        triggerHit = true;
        fillPrice = c;
      } else if (order.type === 'LIMIT') {
        if (order.side === 'BUY' && l <= order.price) {
          triggerHit = true;
          fillPrice = Math.min(o, order.price);
        } else if (order.side === 'SELL' && h >= order.price) {
          triggerHit = true;
          fillPrice = Math.max(o, order.price);
        }
      } else if (order.type === 'STOP') {
        if (order.side === 'BUY' && h >= order.price) {
          triggerHit = true;
          fillPrice = Math.max(o, order.price);
        } else if (order.side === 'SELL' && l <= order.price) {
          triggerHit = true;
          fillPrice = Math.min(o, order.price);
        }
      }
      if (triggerHit) {
        this.executeFill(order, fillPrice, barIdx);
        this.removeOrderAt(i);
        i--;
      }
    }
  }

  // BUG 4 & 5 FIX: Strict separation of raw data prices and execution friction
       private executeFill(order: Order, expectedPrice: number, barIdx: number): void {
    order.active = false;
    const slippage = this.calculateSlippage(expectedPrice, order.side, barIdx);
    const realizedPrice = order.side === 'BUY' ? expectedPrice + slippage : expectedPrice - slippage;
    const commission = this.calculateCommission(realizedPrice, order.quantity);
    
    let positionIndex = -1;
    for (let i = 0; i < this.activePositionsCount; i++) {
      if (this.activePositions[i].symbol === order.symbol && this.activePositions[i].quantity > 0) {
        positionIndex = i;
        break;
      }
    }
    const existingPos = positionIndex >= 0 ? this.activePositions[positionIndex] : null;
    const isOpeningTrade = !existingPos || existingPos.side === order.side;

    if (isOpeningTrade) {
      // PHASE 2 FIX: Apply contractMultiplier to notional value
      const multiplier = this.friction.contractMultiplier || 1.0;
      const notionalValue = order.quantity * realizedPrice * multiplier;

      if (order.side === 'BUY') {
        this.cash -= (notionalValue + commission);
      } else {
        this.cash += (notionalValue - commission);
      }

      const pos = this.positionPool.obtain(
        order.symbol, order.side, realizedPrice, order.quantity,
        realizedPrice * (order.side === 'BUY' ? 0.98 : 1.02), 
        realizedPrice * (order.side === 'BUY' ? 1.06 : 0.94)
      );
      pos.entryBar = barIdx;
      pos.entryTimestamp = this.data.timestamps[barIdx];
      this.activePositions[this.activePositionsCount] = pos;
      this.activePositionsCount++;

      this.openTradeEntries.set(order.symbol, { 
        barIdx, price: realizedPrice, qty: order.quantity, commission, slippage 
      });
    } else {
      // ... (Keep your existing closing trade logic here, it's fine)
      // Just ensure you use the multiplier when calculating grossPnL for shorts/longs
      const entry = this.openTradeEntries.get(order.symbol);
      if (!entry) return;

      const multiplier = this.friction.contractMultiplier || 1.0;
      const notionalExit = order.quantity * realizedPrice * multiplier;
      
      if (order.side === 'SELL') this.cash += (notionalExit - commission);
      else this.cash -= (notionalExit + commission);

      const grossPnL = existingPos!.side === 'BUY' 
        ? (realizedPrice - entry.price) * order.quantity * multiplier
        : (entry.price - realizedPrice) * order.quantity * multiplier;

      const totalCommission = entry.commission + commission;
      const totalSlippage = entry.slippage + slippage;
      const netPnL = grossPnL - totalCommission - totalSlippage;

      this.tradePnLs.push(netPnL);
      if (netPnL > 0) { this.winningTradesPnL += netPnL; this.totalWins++; }
      else { this.losingTradesPnL += Math.abs(netPnL); this.totalLosses++; }

      this.tradeRecords.push({
        id: this.nextTradeId++, symbol: order.symbol, side: existingPos!.side,
        entryPrice: entry.price, exitPrice: realizedPrice, quantity: entry.qty,
        entryBar: entry.barIdx, exitBar: barIdx,
        entryTimestamp: this.data.timestamps[entry.barIdx], exitTimestamp: this.data.timestamps[barIdx],
        grossPnL, commission: totalCommission, slippage: totalSlippage, netPnL,
        strategy: this.strategy.name
      });

      this.openTradeEntries.delete(order.symbol);
      this.removePositionAt(positionIndex);
      this.positionPool.recycle(existingPos!);
    }
  }

  public manageActivePositions(h: number, l: number, _c: number, barIdx: number): void {
    for (let i = 0; i < this.activePositionsCount; i++) {
      const pos = this.activePositions[i];
      let closed = false;
      let exitPrice = 0;
      if (pos.side === 'BUY') {
        if (l <= pos.stopLossPrice) { closed = true; exitPrice = pos.stopLossPrice; }
        else if (h >= pos.takeProfitPrice) { closed = true; exitPrice = pos.takeProfitPrice; }
      } else {
        if (h >= pos.stopLossPrice) { closed = true; exitPrice = pos.stopLossPrice; }
        else if (l <= pos.takeProfitPrice) { closed = true; exitPrice = pos.takeProfitPrice; }
      }
      if (closed) {
        this.liquidatePosition(pos, exitPrice, barIdx);
        this.removePositionAt(i);
        i--;
      }
    }
  }

     private liquidatePosition(pos: Position, expectedPrice: number, barIdx: number): void {
    // PHASE 5 FIX: Cover side is the opposite of the position side
    const coverSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
    const slippage = this.calculateSlippage(expectedPrice, coverSide, barIdx);
    const realizedExitPrice = coverSide === 'SELL' ? expectedPrice - slippage : expectedPrice + slippage;
    const commission = this.calculateCommission(realizedExitPrice, pos.quantity);

    if (coverSide === 'SELL') {
      this.cash += (pos.quantity * realizedExitPrice - commission);
    } else {
      this.cash -= (pos.quantity * realizedExitPrice + commission);
    }

    const entry = this.openTradeEntries.get(pos.symbol);
    const grossPnL = pos.side === 'BUY'
      ? (realizedExitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - realizedExitPrice) * pos.quantity;

    const totalCommission = (entry?.commission ?? 0) + commission;
    const totalSlippage = (entry?.slippage ?? 0) + slippage;
    const netPnL = grossPnL - totalCommission - totalSlippage;

    this.tradePnLs.push(netPnL);
    if (netPnL > 0) { this.winningTradesPnL += netPnL; this.totalWins++; }
    else { this.losingTradesPnL += Math.abs(netPnL); this.totalLosses++; }

    this.tradeRecords.push({
      id: this.nextTradeId++,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: realizedExitPrice,
      quantity: pos.quantity,
      entryBar: pos.entryBar ?? 0,
      exitBar: barIdx,
      entryTimestamp: this.data.timestamps[pos.entryBar ?? 0],
      exitTimestamp: this.data.timestamps[barIdx],
      grossPnL,
      commission: totalCommission,
      slippage: totalSlippage,
      netPnL,
      strategy: this.strategy.name
    });

    this.openTradeEntries.delete(pos.symbol);
  }
  private calculateCommission(price: number, quantity: number): number {
    if (this.friction.commissionType === 'FLAT') return this.friction.commissionValue;
    if (this.friction.commissionType === 'PER_UNIT') return quantity * this.friction.commissionValue;
    if (this.friction.commissionType === 'PERCENTAGE') return quantity * price * (this.friction.commissionValue / 10000);
    return 0;
  }

    private calculateSlippage(price: number, _side: OrderSide, barIdx: number): number {
    const model = this.friction.slippageModel;

    // 1. Stocks / Traditional Futures (Volatility-based)
    if (model === 'ATR') {
      const scaleMultiplier = this.friction.atrMultiplier ?? 0.2;
      const atrValue = this.atrValues[barIdx] || (price * 0.0015);
      return scaleMultiplier * atrValue;
    }

    // 2. Crypto / High-Volatility Assets (Percentage-based)
    if (model === 'PERCENTAGE') {
      // slippageValue is expected as a percentage, e.g., 0.05 means 0.05%
      const pct = (this.friction.slippageValue ?? 0.05) / 100;
      return price * pct;
    }

    // 3. Forex / Fixed Income (Absolute Tick/Pip-based)
    if (model === 'FIXED_TICK') {
      // slippageValue is the absolute tick size, e.g., 0.0001 for EUR/USD
      return this.friction.slippageValue ?? 0.0001;
    }

    // 4. Fallback (NONE or MARKET_IMPACT)
    return 0;
  }

    public updatePortfolioValuation(barClose: number, index: number): void {
    const multiplier = this.friction.contractMultiplier || 1.0; // <-- PHASE 2 FIX
    let positionUnrealizedValue = 0;
    
    for (let i = 0; i < this.activePositionsCount; i++) {
      const pos = this.activePositions[i];
      // Apply multiplier to market basis calculations
      const costBasis = pos.quantity * pos.entryPrice * multiplier;
      const currentMarketBasis = pos.quantity * barClose * multiplier;
      
      if (pos.side === 'BUY') positionUnrealizedValue += (currentMarketBasis - costBasis);
      else positionUnrealizedValue += (costBasis - currentMarketBasis);
    }
    
    const priorEquity = this.currentEquity;
    this.currentEquity = Math.max(0, this.cash + positionUnrealizedValue);
    this.equityCurve[index] = this.currentEquity;
    
    if (this.currentEquity > this.peakEquity) {
      this.peakEquity = this.currentEquity;
      this.drawdownStartBar = -1;
    } else {
      if (this.drawdownStartBar === -1) this.drawdownStartBar = index;
      const duration = index - this.drawdownStartBar;
      if (duration > this.maxDrawdownDurationBars) {
        this.maxDrawdownDurationBars = duration;
      }
    }
    
    const peak = Math.max(this.peakEquity, 1);
    const currentDD = ((peak - this.currentEquity) / peak) * 100;
    if (currentDD > this.maxDrawdownPercent) {
      this.maxDrawdownPercent = Math.min(100, Math.max(0, currentDD));
    }
    if (this.currentEquity === 0 && priorEquity > 0) {
      this.peakEquity = Math.max(this.peakEquity, 1);
    }
  }
  private normalizeRiskPercent(riskPercent: number | undefined): number {
    if (riskPercent === undefined || Number.isNaN(riskPercent)) return 0.01;
    if (riskPercent > 1) return riskPercent / 100;
    return Math.max(0, Math.min(1, riskPercent));
  }

  private removeOrderAt(idx: number): void {
    for (let i = idx; i < this.activeOrdersCount - 1; i++) this.activeOrders[i] = this.activeOrders[i + 1];
    this.activeOrdersCount--;
  }

  private removePositionAt(idx: number): void {
    for (let i = idx; i < this.activePositionsCount - 1; i++) this.activePositions[i] = this.activePositions[i + 1];
    this.activePositionsCount--;
  }

  public generatePerformanceLedger(): PerformanceLedger {
    const netProfit = this.currentEquity - this.initialCapital;
    const profitFactor = this.losingTradesPnL === 0 ? this.winningTradesPnL : this.winningTradesPnL / this.losingTradesPnL;
    const totalTrades = this.totalWins + this.totalLosses;
    return {
      grossProfit: this.winningTradesPnL,
      grossLoss: this.losingTradesPnL,
      netProfit,
      profitFactor,
      maxDrawdownPercent: this.maxDrawdownPercent,
      maxDrawdownDurationMs: this.maxDrawdownDurationBars * 24 * 60 * 60 * 1000,
      sharpeRatioAnnualized: 0,
      sortinoRatioAnnualized: 0,
      ulcerIndex: 0,
      martinRatio: 0,
      tharpExpectancy: 0,
      totalTrades,
      winRate: totalTrades > 0 ? this.totalWins / totalTrades : 0,
      avgWin: this.totalWins > 0 ? this.winningTradesPnL / this.totalWins : 0,
      avgLoss: this.totalLosses > 0 ? this.losingTradesPnL / this.totalLosses : 0,
      largestWin: this.tradePnLs.length > 0 ? Math.max(0, ...this.tradePnLs.filter(p => p > 0)) : 0,
      largestLoss: this.tradePnLs.length > 0 ? Math.min(0, ...this.tradePnLs.filter(p => p < 0)) : 0,
      avgTrade: totalTrades > 0 ? (this.winningTradesPnL - this.losingTradesPnL) / totalTrades : 0,
      avgHoldingPeriodBars: 0,
      trades: this.tradeRecords
    };
  }
}