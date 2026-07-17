/**
 * Data validation utilities for the backtesting engine
 */

export function validatePrice(price: number): boolean {
  return price > 0 && Number.isFinite(price);
}

export function validateVolume(volume: number): boolean {
  return volume >= 0 && Number.isFinite(volume);
}

export function validateOHLCV(open: number, high: number, low: number, close: number, volume: number): boolean {
  return (
    validatePrice(open) &&
    validatePrice(high) &&
    validatePrice(low) &&
    validatePrice(close) &&
    validateVolume(volume) &&
    high >= low &&
    high >= Math.max(open, close) &&
    low <= Math.min(open, close)
  );
}
