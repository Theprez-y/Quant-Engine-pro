import { ExpressionNode, ConditionNode, IndicatorNode, ValueNode, Comparator } from './types';

export class StrategyDSL {
  public evaluate(expr: ExpressionNode, barIdx: number, data: any): boolean {
    if (!expr || !expr.conditions || expr.conditions.length === 0) return false;
    
    let result = this.evaluateCondition(expr.conditions[0], barIdx, data);
    for (let i = 1; i < expr.conditions.length; i++) {
      const condResult = this.evaluateCondition(expr.conditions[i], barIdx, data);
      const op = expr.logicalOps[i - 1];
      if (op === 'and') result = result && condResult;
      else if (op === 'or') result = result || condResult;
    }
    return result;
  }

  private evaluateCondition(cond: ConditionNode, barIdx: number, data: any): boolean {
    // BUG 1 FIX: Intercept MACD to force crossing logic instead of simple level comparison
    if (cond.left.type === 'indicator' && cond.left.name === 'macd') {
       const threshold = cond.right.type === 'value' ? cond.right.value : this.resolveValue(cond.right, barIdx, data);
       return this.evaluateMACDCrossing(cond.left, cond.comparator, threshold, barIdx, data);
    }

    const leftVal = this.resolveValue(cond.left, barIdx, data);
    const rightVal = this.resolveValue(cond.right, barIdx, data);

    switch (cond.comparator) {
      case '>': return leftVal > rightVal;
      case '<': return leftVal < rightVal;
      case '>=': return leftVal >= rightVal;
      case '<=': return leftVal <= rightVal;
      case '==': return leftVal === rightVal;
      case '!=': return leftVal !== rightVal;
      default: return false;
    }
  }

  private evaluateMACDCrossing(indicator: IndicatorNode, comparator: Comparator, threshold: number, barIdx: number, data: any): boolean {
    if (barIdx < 1) return false;
    const [fast, slow] = indicator.params; // e.g., 12, 26
    
    const currEmaFast = this.calculateEMA(data.close, fast, barIdx);
    const currEmaSlow = this.calculateEMA(data.close, slow, barIdx);
    const currMacdLine = currEmaFast - currEmaSlow;
    
    const prevEmaFast = this.calculateEMA(data.close, fast, barIdx - 1);
    const prevEmaSlow = this.calculateEMA(data.close, slow, barIdx - 1);
    const prevMacdLine = prevEmaFast - prevEmaSlow;

    // Strict crossing logic
    if (comparator === '>') return prevMacdLine <= threshold && currMacdLine > threshold;
    if (comparator === '<') return prevMacdLine >= threshold && currMacdLine < threshold;
    if (comparator === '>=') return currMacdLine >= threshold;
    if (comparator === '<=') return currMacdLine <= threshold;
    
    return false;
  }

  private resolveValue(node: IndicatorNode | ValueNode, barIdx: number, data: any): number {
    if (node.type === 'value') return node.value;
    const ind = node as IndicatorNode;
    switch (ind.name) {
      case 'close': return data.close[barIdx];
      case 'open': return data.open[barIdx];
      case 'high': return data.high[barIdx];
      case 'low': return data.low[barIdx];
      case 'volume': return data.volume[barIdx];
      case 'sma': return this.calculateSMA(data.close, ind.params[0], barIdx);
      case 'ema': return this.calculateEMA(data.close, ind.params[0], barIdx);
      case 'rsi': return this.calculateRSI(data.close, ind.params[0], barIdx);
      case 'atr': return this.calculateATR(data.high, data.low, data.close, ind.params[0], barIdx);
      case 'macd': return this.calculateEMA(data.close, ind.params[0], barIdx) - this.calculateEMA(data.close, ind.params[1], barIdx);
      default: return 0;
    }
  }

  private calculateSMA(arr: Float64Array, period: number, idx: number): number {
    if (idx < period - 1) return arr[idx];
    let sum = 0;
    for (let i = idx - period + 1; i <= idx; i++) sum += arr[i];
    return sum / period;
  }

  private calculateEMA(arr: Float64Array, period: number, idx: number): number {
    if (idx < period - 1) return arr[idx];
    const k = 2 / (period + 1);
    let ema = arr[0];
    for (let i = 1; i <= idx; i++) ema = arr[i] * k + ema * (1 - k);
    return ema;
  }

  private calculateRSI(arr: Float64Array, period: number, idx: number): number {
    if (idx < period) return 50;
    let gains = 0, losses = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
      const diff = arr[i] - arr[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  private calculateATR(high: Float64Array, low: Float64Array, close: Float64Array, period: number, idx: number): number {
    if (idx < period) return 0;
    let sum = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
      sum += Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
    }
    return sum / period;
  }
}