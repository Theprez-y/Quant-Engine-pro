import { Order, Position, OrderType, OrderSide } from './types';

export class OrderPool {
  private pool: Order[] = [];
  private nextId = 1;

  constructor(capacity: number = 5000) {
    
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        id: 0,
        active: false,
        symbol: '',
        type: 'MARKET',
        side: 'BUY',
        price: 0,
        quantity: 0,
        timestamp: 0n,
        filled: false
      });
    }
  }

  obtain(symbol: string, type: OrderType, side: OrderSide, price: number, quantity: number): Order {
    for (const order of this.pool) {
      if (!order.active) {
        order.id = this.nextId++;
        order.active = true;
        order.symbol = symbol;
        order.type = type;
        order.side = side;
        order.price = price;
        order.quantity = quantity;
        order.timestamp = 0n;
        order.filled = false;
        return order;
      }
    }
    const order: Order = {
      id: this.nextId++,
      active: true,
      symbol,
      type,
      side,
      price,
      quantity,
      timestamp: 0n,
      filled: false
    };
    this.pool.push(order);
    return order;
  }

  recycle(order: Order): void {
    order.active = false;
    order.symbol = '';
    order.quantity = 0;
    order.price = 0;
  }

  getAllActive(): Order[] {
    return this.pool.filter(o => o.active);
  }
}

export class PositionPool {
  private pool: Position[] = [];
  private nextId = 1;

  constructor(capacity: number = 1000) {
    
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        id: 0,
        symbol: '',
        side: 'BUY',
        entryPrice: 0,
        quantity: 0,
        entryBar: 0,
        entryTimestamp: 0n,
        stopLossPrice: 0,
        takeProfitPrice: 0,
        unrealizedPnL: 0
      });
    }
  }

  obtain(
    symbol: string,
    side: OrderSide,
    entryPrice: number,
    quantity: number,
    stopLossPrice: number,
    takeProfitPrice: number
  ): Position {
    for (const pos of this.pool) {
      if (pos.quantity === 0) {
        pos.id = this.nextId++;
        pos.symbol = symbol;
        pos.side = side;
        pos.entryPrice = entryPrice;
        pos.quantity = quantity;
        pos.entryBar = 0;
        pos.entryTimestamp = 0n;
        pos.stopLossPrice = stopLossPrice;
        pos.takeProfitPrice = takeProfitPrice;
        pos.unrealizedPnL = 0;
        return pos;
      }
    }
    const pos: Position = {
      id: this.nextId++,
      symbol,
      side,
      entryPrice,
      quantity,
      entryBar: 0,
      entryTimestamp: 0n,
      stopLossPrice,
      takeProfitPrice,
      unrealizedPnL: 0
    };
    this.pool.push(pos);
    return pos;
  }

  recycle(pos: Position): void {
    pos.quantity = 0;
    pos.symbol = '';
    pos.entryPrice = 0;
    pos.unrealizedPnL = 0;
  }

  getAllActive(): Position[] {
    return this.pool.filter(p => p.quantity > 0);
  }
}
