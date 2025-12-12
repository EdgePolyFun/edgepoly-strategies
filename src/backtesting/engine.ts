/**
 * EdgePoly Strategies - Backtesting Engine
 * 
 * Comprehensive backtesting framework for strategy validation.
 */

import type {
  IStrategy,
  BacktestConfig,
  BacktestResult,
  BacktestSummary,
  BacktestTrade,
  EquityPoint,
  DrawdownPeriod,
  MonthlyReturn,
  PerformanceMetrics,
  MarketSnapshot,
  Signal,
} from '../types';
import { generateId, maxDrawdown, sharpeRatio, sortinoRatio, cagr } from '../utils/helpers';

export interface MarketDataProvider {
  getHistoricalData(
    marketId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MarketSnapshot[]>;
}

export class BacktestEngine {
  private dataProvider: MarketDataProvider;
  private slippage: number;
  private fees: number;

  constructor(
    dataProvider: MarketDataProvider,
    options: { slippage?: number; fees?: number } = {}
  ) {
    this.dataProvider = dataProvider;
    this.slippage = options.slippage || 0.005; // 0.5% default
    this.fees = options.fees || 0.02; // 2% default fees
  }

  async run(
    strategy: IStrategy,
    config: BacktestConfig
  ): Promise<BacktestResult> {
    // Initialize strategy
    await strategy.initialize(config.parameters);

    // Fetch historical data
    const marketData = await this.fetchMarketData(config);

    // Run simulation
    const { trades, equityCurve } = await this.simulate(
      strategy,
      marketData,
      config
    );

    // Calculate metrics
    const summary = this.calculateSummary(trades, equityCurve, config);
    const drawdowns = this.calculateDrawdowns(equityCurve);
    const monthlyReturns = this.calculateMonthlyReturns(equityCurve);
    const metrics = this.calculateMetrics(trades, equityCurve, config);

    return {
      config,
      summary,
      trades,
      equityCurve,
      drawdowns,
      monthlyReturns,
      metrics,
    };
  }

  private async fetchMarketData(
    config: BacktestConfig
  ): Promise<Map<string, MarketSnapshot[]>> {
    const marketData = new Map<string, MarketSnapshot[]>();

    const marketIds = config.markets || [];

    await Promise.all(
      marketIds.map(async (marketId) => {
        const data = await this.dataProvider.getHistoricalData(
          marketId,
          config.startDate,
          config.endDate
        );
        marketData.set(marketId, data);
      })
    );

    return marketData;
  }

  private async simulate(
    strategy: IStrategy,
    marketData: Map<string, MarketSnapshot[]>,
    config: BacktestConfig
  ): Promise<{ trades: BacktestTrade[]; equityCurve: EquityPoint[] }> {
    const trades: BacktestTrade[] = [];
    const equityCurve: EquityPoint[] = [];
    const positions: Map<string, { 
      side: 'buy' | 'sell';
      entryPrice: number;
      entryTime: Date;
      size: number;
      signal: Signal;
    }> = new Map();

    let equity = config.initialCapital;
    let peakEquity = equity;

    // Get all unique timestamps
    const allTimestamps = new Set<number>();
    for (const snapshots of marketData.values()) {
      for (const snapshot of snapshots) {
        allTimestamps.add(snapshot.timestamp.getTime());
      }
    }
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Simulate each time step
    for (const timestamp of sortedTimestamps) {
      const date = new Date(timestamp);
      
      // Get current market snapshots
      const currentSnapshots: MarketSnapshot[] = [];
      for (const [, snapshots] of marketData) {
        const snapshot = snapshots.find(s => s.timestamp.getTime() === timestamp);
        if (snapshot) currentSnapshots.push(snapshot);
      }

      if (currentSnapshots.length === 0) continue;

      // Check for position exits
      for (const [marketId, position] of positions) {
        const market = currentSnapshots.find(m => m.id === marketId);
        if (!market) continue;

        const currentPrice = market.outcomes[0].price;
        const shouldExit = this.shouldExitPosition(position, currentPrice, market);

        if (shouldExit || market.resolved) {
          const exitPrice = this.applySlippage(
            currentPrice,
            position.side === 'buy' ? 'sell' : 'buy'
          );

          const pnl = this.calculatePnL(
            position.entryPrice,
            exitPrice,
            position.size,
            position.side
          );

          const trade: BacktestTrade = {
            id: generateId(),
            marketId,
            outcomeId: market.outcomes[0].id,
            side: position.side,
            entryTime: position.entryTime,
            exitTime: date,
            entryPrice: position.entryPrice,
            exitPrice,
            size: position.size,
            pnl: pnl - this.fees * position.size * 2,
            pnlPercent: (pnl / (position.size * position.entryPrice)) * 100,
            fees: this.fees * position.size * 2,
            slippage: Math.abs(exitPrice - currentPrice) * position.size,
            signal: position.signal,
          };

          trades.push(trade);
          equity += trade.pnl;
          positions.delete(marketId);

          // Notify strategy
          strategy.onSignalExecuted(position.signal, {
            signalId: position.signal.id,
            executed: true,
            entryPrice: position.entryPrice,
            exitPrice,
            pnl: trade.pnl,
            pnlPercent: trade.pnlPercent,
            holdingPeriod: (date.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60),
            outcome: trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'breakeven',
          });
        }
      }

      // Generate new signals
      const signals = await strategy.generateSignals(currentSnapshots);

      // Process signals
      for (const signal of signals) {
        if (positions.size >= (config.maxConcurrentPositions || 10)) continue;
        if (positions.has(signal.marketId)) continue;

        const isValid = await strategy.validateSignal(signal);
        if (!isValid) continue;

        const market = currentSnapshots.find(m => m.id === signal.marketId);
        if (!market || market.resolved) continue;

        // Calculate position size
        const positionSize = strategy.getPositionSize(signal, equity);
        if (positionSize < 1) continue;

        const entryPrice = this.applySlippage(
          signal.entryPrice || market.outcomes[0].price,
          signal.type as 'buy' | 'sell'
        );

        positions.set(signal.marketId, {
          side: signal.type as 'buy' | 'sell',
          entryPrice,
          entryTime: date,
          size: positionSize,
          signal,
        });
      }

      // Update equity curve
      peakEquity = Math.max(peakEquity, equity);
      const drawdown = peakEquity - equity;
      const drawdownPercent = peakEquity > 0 ? drawdown / peakEquity : 0;

      equityCurve.push({
        timestamp: date,
        equity,
        drawdown,
        drawdownPercent,
      });
    }

    // Close remaining positions at end
    for (const [marketId, position] of positions) {
      const lastSnapshots = Array.from(marketData.values())
        .map(s => s[s.length - 1])
        .filter(Boolean);
      const market = lastSnapshots.find(m => m.id === marketId);

      if (market) {
        const exitPrice = market.outcomes[0].price;
        const pnl = this.calculatePnL(
          position.entryPrice,
          exitPrice,
          position.size,
          position.side
        );

        trades.push({
          id: generateId(),
          marketId,
          outcomeId: market.outcomes[0].id,
          side: position.side,
          entryTime: position.entryTime,
          exitTime: config.endDate,
          entryPrice: position.entryPrice,
          exitPrice,
          size: position.size,
          pnl: pnl - this.fees * position.size * 2,
          pnlPercent: (pnl / (position.size * position.entryPrice)) * 100,
          fees: this.fees * position.size * 2,
          slippage: 0,
          signal: position.signal,
        });
      }
    }

    return { trades, equityCurve };
  }

  private shouldExitPosition(
    position: { side: 'buy' | 'sell'; entryPrice: number; signal: Signal },
    currentPrice: number,
    _market: MarketSnapshot
  ): boolean {
    const { signal, entryPrice, side } = position;

    // Check stop loss
    if (signal.stopLoss) {
      if (side === 'buy' && currentPrice <= signal.stopLoss) return true;
      if (side === 'sell' && currentPrice >= signal.stopLoss) return true;
    }

    // Check take profit
    if (signal.takeProfit) {
      if (side === 'buy' && currentPrice >= signal.takeProfit) return true;
      if (side === 'sell' && currentPrice <= signal.takeProfit) return true;
    }

    // Check expiration
    if (signal.expiresAt && new Date() > signal.expiresAt) return true;

    return false;
  }

  private applySlippage(price: number, side: 'buy' | 'sell'): number {
    const slippageFactor = side === 'buy' ? 1 + this.slippage : 1 - this.slippage;
    return price * slippageFactor;
  }

  private calculatePnL(
    entryPrice: number,
    exitPrice: number,
    size: number,
    side: 'buy' | 'sell'
  ): number {
    const priceDiff = side === 'buy' 
      ? exitPrice - entryPrice 
      : entryPrice - exitPrice;
    return priceDiff * size;
  }

  private calculateSummary(
    trades: BacktestTrade[],
    equityCurve: EquityPoint[],
    config: BacktestConfig
  ): BacktestSummary {
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const returns = equityCurve.slice(1).map((e, i) => 
      (e.equity - equityCurve[i].equity) / equityCurve[i].equity
    );

    const holdingPeriods = trades
      .filter(t => t.exitTime)
      .map(t => (t.exitTime!.getTime() - t.entryTime.getTime()) / (1000 * 60 * 60));

    const dd = maxDrawdown(equityCurve.map(e => e.equity));

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
      totalPnl,
      totalReturn: config.initialCapital > 0 
        ? totalPnl / config.initialCapital 
        : 0,
      maxDrawdown: dd.percent,
      sharpeRatio: sharpeRatio(returns),
      sortinoRatio: sortinoRatio(returns),
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
      averageWin: winningTrades.length > 0 
        ? grossProfit / winningTrades.length 
        : 0,
      averageLoss: losingTrades.length > 0 
        ? grossLoss / losingTrades.length 
        : 0,
      largestWin: winningTrades.length > 0 
        ? Math.max(...winningTrades.map(t => t.pnl)) 
        : 0,
      largestLoss: losingTrades.length > 0 
        ? Math.max(...losingTrades.map(t => Math.abs(t.pnl))) 
        : 0,
      averageHoldingPeriod: holdingPeriods.length > 0 
        ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length 
        : 0,
      exposure: this.calculateExposure(trades, equityCurve),
    };
  }

  private calculateExposure(
    trades: BacktestTrade[],
    equityCurve: EquityPoint[]
  ): number {
    if (equityCurve.length === 0) return 0;

    const totalDuration = equityCurve[equityCurve.length - 1].timestamp.getTime() - 
                         equityCurve[0].timestamp.getTime();
    
    let exposedTime = 0;
    for (const trade of trades) {
      if (trade.exitTime) {
        exposedTime += trade.exitTime.getTime() - trade.entryTime.getTime();
      }
    }

    return totalDuration > 0 ? exposedTime / totalDuration : 0;
  }

  private calculateDrawdowns(equityCurve: EquityPoint[]): DrawdownPeriod[] {
    const drawdowns: DrawdownPeriod[] = [];
    let peak = equityCurve[0]?.equity || 0;
    let peakDate = equityCurve[0]?.timestamp;
    let inDrawdown = false;
    let currentDrawdown: DrawdownPeriod | null = null;

    for (const point of equityCurve) {
      if (point.equity > peak) {
        if (inDrawdown && currentDrawdown) {
          currentDrawdown.recovered = true;
          currentDrawdown.recoveryDate = point.timestamp;
          drawdowns.push(currentDrawdown);
          currentDrawdown = null;
          inDrawdown = false;
        }
        peak = point.equity;
        peakDate = point.timestamp;
      } else if (point.drawdown > 0) {
        if (!inDrawdown) {
          inDrawdown = true;
          currentDrawdown = {
            startDate: peakDate!,
            endDate: point.timestamp,
            maxDrawdown: point.drawdown,
            maxDrawdownPercent: point.drawdownPercent,
            duration: 0,
            recovered: false,
          };
        } else if (currentDrawdown) {
          currentDrawdown.endDate = point.timestamp;
          if (point.drawdown > currentDrawdown.maxDrawdown) {
            currentDrawdown.maxDrawdown = point.drawdown;
            currentDrawdown.maxDrawdownPercent = point.drawdownPercent;
          }
          currentDrawdown.duration = 
            (currentDrawdown.endDate.getTime() - currentDrawdown.startDate.getTime()) / 
            (1000 * 60 * 60 * 24);
        }
      }
    }

    if (inDrawdown && currentDrawdown) {
      drawdowns.push(currentDrawdown);
    }

    return drawdowns;
  }

  private calculateMonthlyReturns(equityCurve: EquityPoint[]): MonthlyReturn[] {
    const monthly: MonthlyReturn[] = [];
    const byMonth = new Map<string, EquityPoint[]>();

    for (const point of equityCurve) {
      const key = `${point.timestamp.getFullYear()}-${point.timestamp.getMonth()}`;
      if (!byMonth.has(key)) {
        byMonth.set(key, []);
      }
      byMonth.get(key)!.push(point);
    }

    for (const [key, points] of byMonth) {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      const startEquity = points[0].equity;
      const endEquity = points[points.length - 1].equity;
      const returnPct = startEquity > 0 
        ? (endEquity - startEquity) / startEquity 
        : 0;

      monthly.push({
        year,
        month,
        return: returnPct,
        trades: 0, // Would need to track this separately
      });
    }

    return monthly.sort((a, b) => 
      (a.year - b.year) || (a.month - b.month)
    );
  }

  private calculateMetrics(
    trades: BacktestTrade[],
    equityCurve: EquityPoint[],
    config: BacktestConfig
  ): PerformanceMetrics {
    const returns = equityCurve.slice(1).map((e, i) => 
      (e.equity - equityCurve[i].equity) / equityCurve[i].equity
    );

    const startEquity = config.initialCapital;
    const endEquity = equityCurve[equityCurve.length - 1]?.equity || startEquity;
    const years = (config.endDate.getTime() - config.startDate.getTime()) / 
                  (1000 * 60 * 60 * 24 * 365);

    const dd = maxDrawdown(equityCurve.map(e => e.equity));
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const avgWin = winningTrades.length > 0 
      ? grossProfit / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? grossLoss / losingTrades.length 
      : 1;

    const winRate = trades.length > 0 
      ? winningTrades.length / trades.length 
      : 0;

    const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

    // Calculate volatility
    const avgReturn = returns.length > 0 
      ? returns.reduce((a, b) => a + b, 0) / returns.length 
      : 0;
    const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.length > 0 
      ? squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length 
      : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    // Ulcer Index
    const squaredDrawdowns = equityCurve.map(e => Math.pow(e.drawdownPercent * 100, 2));
    const ulcerIndex = Math.sqrt(
      squaredDrawdowns.reduce((a, b) => a + b, 0) / squaredDrawdowns.length
    );

    return {
      cagr: cagr(startEquity, endEquity, years),
      volatility,
      sharpeRatio: sharpeRatio(returns),
      sortinoRatio: sortinoRatio(returns),
      calmarRatio: dd.percent > 0 ? cagr(startEquity, endEquity, years) / dd.percent : 0,
      maxDrawdown: dd.percent,
      maxDrawdownDuration: this.getMaxDrawdownDuration(equityCurve),
      winRate,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
      expectancy,
      payoffRatio: avgLoss > 0 ? avgWin / avgLoss : 0,
      ulcerIndex,
    };
  }

  private getMaxDrawdownDuration(equityCurve: EquityPoint[]): number {
    let maxDuration = 0;
    let peak = equityCurve[0]?.equity || 0;
    let peakDate = equityCurve[0]?.timestamp;

    for (const point of equityCurve) {
      if (point.equity > peak) {
        const duration = (point.timestamp.getTime() - peakDate!.getTime()) / 
                        (1000 * 60 * 60 * 24);
        maxDuration = Math.max(maxDuration, duration);
        peak = point.equity;
        peakDate = point.timestamp;
      }
    }

    return maxDuration;
  }
}
