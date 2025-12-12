/**
 * EdgePoly Strategies - Signal Aggregator
 * 
 * Combines signals from multiple strategies for consensus-based trading.
 */

import type { Signal, SignalType, IStrategy, MarketSnapshot, MarketId } from '../types';
import { generateId } from '../utils/helpers';

export interface AggregatedSignal extends Signal {
  sourceStrategies: string[];
  consensus: number; // 0-1
  aggregatedConfidence: number;
}

export interface AggregatorConfig {
  minConsensus: number; // 0-1, minimum agreement required
  weightByPerformance: boolean;
  requireUnanimous: boolean;
  maxSignalsPerMarket: number;
}

export class SignalAggregator {
  private strategies: Map<string, { strategy: IStrategy; weight: number }> = new Map();
  private config: AggregatorConfig;

  constructor(config: Partial<AggregatorConfig> = {}) {
    this.config = {
      minConsensus: config.minConsensus || 0.5,
      weightByPerformance: config.weightByPerformance ?? true,
      requireUnanimous: config.requireUnanimous || false,
      maxSignalsPerMarket: config.maxSignalsPerMarket || 1,
    };
  }

  /**
   * Add a strategy to the aggregator
   */
  addStrategy(strategy: IStrategy, weight: number = 1): void {
    this.strategies.set(strategy.config.id, { strategy, weight });
  }

  /**
   * Remove a strategy from the aggregator
   */
  removeStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
  }

  /**
   * Update strategy weight based on performance
   */
  updateWeight(strategyId: string, weight: number): void {
    const entry = this.strategies.get(strategyId);
    if (entry) {
      entry.weight = weight;
    }
  }

  /**
   * Generate aggregated signals from all strategies
   */
  async generateSignals(markets: MarketSnapshot[]): Promise<AggregatedSignal[]> {
    // Collect signals from all strategies
    const allSignals: Map<MarketId, Map<string, Signal[]>> = new Map();

    for (const [strategyId, { strategy }] of this.strategies) {
      const signals = await strategy.generateSignals(markets);
      
      for (const signal of signals) {
        if (!allSignals.has(signal.marketId)) {
          allSignals.set(signal.marketId, new Map());
        }
        
        const marketSignals = allSignals.get(signal.marketId)!;
        if (!marketSignals.has(strategyId)) {
          marketSignals.set(strategyId, []);
        }
        
        marketSignals.get(strategyId)!.push(signal);
      }
    }

    // Aggregate signals per market
    const aggregatedSignals: AggregatedSignal[] = [];

    for (const [marketId, strategySignals] of allSignals) {
      const aggregated = this.aggregateMarketSignals(marketId, strategySignals);
      aggregatedSignals.push(...aggregated);
    }

    return aggregatedSignals;
  }

  private aggregateMarketSignals(
    marketId: MarketId,
    strategySignals: Map<string, Signal[]>
  ): AggregatedSignal[] {
    const results: AggregatedSignal[] = [];
    const totalWeight = this.getTotalWeight();
    const strategyCount = this.strategies.size;

    // Group by signal type (buy/sell)
    const buySignals: Array<{ strategyId: string; signal: Signal; weight: number }> = [];
    const sellSignals: Array<{ strategyId: string; signal: Signal; weight: number }> = [];

    for (const [strategyId, signals] of strategySignals) {
      const { weight } = this.strategies.get(strategyId)!;
      
      for (const signal of signals) {
        if (signal.type === 'buy') {
          buySignals.push({ strategyId, signal, weight });
        } else if (signal.type === 'sell') {
          sellSignals.push({ strategyId, signal, weight });
        }
      }
    }

    // Create aggregated buy signal if consensus met
    if (buySignals.length > 0) {
      const buyAggregated = this.createAggregatedSignal(
        marketId,
        'buy',
        buySignals,
        totalWeight,
        strategyCount
      );
      
      if (buyAggregated) {
        results.push(buyAggregated);
      }
    }

    // Create aggregated sell signal if consensus met
    if (sellSignals.length > 0) {
      const sellAggregated = this.createAggregatedSignal(
        marketId,
        'sell',
        sellSignals,
        totalWeight,
        strategyCount
      );
      
      if (sellAggregated) {
        results.push(sellAggregated);
      }
    }

    return results.slice(0, this.config.maxSignalsPerMarket);
  }

  private createAggregatedSignal(
    marketId: MarketId,
    type: SignalType,
    signals: Array<{ strategyId: string; signal: Signal; weight: number }>,
    totalWeight: number,
    totalStrategies: number
  ): AggregatedSignal | null {
    // Calculate weighted consensus
    const weightedSum = signals.reduce((sum, s) => sum + s.weight, 0);
    const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Check minimum consensus
    if (consensus < this.config.minConsensus) return null;

    // Check unanimous requirement
    if (this.config.requireUnanimous && signals.length < totalStrategies) {
      return null;
    }

    // Calculate aggregated values
    const avgConfidence = signals.reduce(
      (sum, s) => sum + s.signal.confidence * s.weight,
      0
    ) / weightedSum;

    const avgStrength = Math.round(
      signals.reduce((sum, s) => sum + s.signal.strength * s.weight, 0) / weightedSum
    ) as 1 | 2 | 3 | 4 | 5;

    // Use weighted average for prices
    const avgEntryPrice = signals.reduce(
      (sum, s) => sum + (s.signal.entryPrice || 0) * s.weight,
      0
    ) / weightedSum;

    // Combine indicators
    const combinedIndicators: Record<string, number> = {};
    for (const { signal, strategyId } of signals) {
      for (const [key, value] of Object.entries(signal.indicators)) {
        combinedIndicators[`${strategyId}_${key}`] = value;
      }
    }

    // Generate combined reasoning
    const reasoning = signals
      .map(s => `[${s.strategyId}] ${s.signal.reasoning}`)
      .join(' | ');

    return {
      id: generateId(),
      strategyId: 'aggregator',
      marketId,
      outcomeId: signals[0].signal.outcomeId,
      type,
      strength: avgStrength,
      confidence: avgConfidence,
      entryPrice: avgEntryPrice || undefined,
      stopLoss: this.aggregateStopLoss(signals, type),
      takeProfit: this.aggregateTakeProfit(signals, type),
      reasoning,
      indicators: combinedIndicators,
      timestamp: new Date(),
      sourceStrategies: signals.map(s => s.strategyId),
      consensus,
      aggregatedConfidence: avgConfidence * consensus,
    };
  }

  private aggregateStopLoss(
    signals: Array<{ signal: Signal; weight: number }>,
    type: SignalType
  ): number | undefined {
    const stopsWithWeight = signals
      .filter(s => s.signal.stopLoss !== undefined)
      .map(s => ({ stop: s.signal.stopLoss!, weight: s.weight }));

    if (stopsWithWeight.length === 0) return undefined;

    // For buys, use the most conservative (highest) stop loss
    // For sells, use the most conservative (lowest) stop loss
    if (type === 'buy') {
      return Math.max(...stopsWithWeight.map(s => s.stop));
    } else {
      return Math.min(...stopsWithWeight.map(s => s.stop));
    }
  }

  private aggregateTakeProfit(
    signals: Array<{ signal: Signal; weight: number }>,
    type: SignalType
  ): number | undefined {
    const profitsWithWeight = signals
      .filter(s => s.signal.takeProfit !== undefined)
      .map(s => ({ profit: s.signal.takeProfit!, weight: s.weight }));

    if (profitsWithWeight.length === 0) return undefined;

    // Use weighted average for take profit
    const totalWeight = profitsWithWeight.reduce((sum, p) => sum + p.weight, 0);
    return profitsWithWeight.reduce(
      (sum, p) => sum + p.profit * p.weight,
      0
    ) / totalWeight;
  }

  private getTotalWeight(): number {
    let total = 0;
    for (const { weight } of this.strategies.values()) {
      total += weight;
    }
    return total;
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): Array<{ id: string; weight: number }> {
    const result: Array<{ id: string; weight: number }> = [];
    for (const [id, { weight }] of this.strategies) {
      result.push({ id, weight });
    }
    return result;
  }
}

// ============================================================================
// Signal Filter
// ============================================================================

export interface FilterConfig {
  minConfidence?: number;
  minStrength?: number;
  allowedTypes?: SignalType[];
  maxAge?: number; // milliseconds
}

export class SignalFilter {
  private config: FilterConfig;

  constructor(config: FilterConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence || 0.5,
      minStrength: config.minStrength || 2,
      allowedTypes: config.allowedTypes || ['buy', 'sell'],
      maxAge: config.maxAge || 60 * 60 * 1000, // 1 hour
    };
  }

  filter(signals: Signal[]): Signal[] {
    return signals.filter(signal => {
      // Confidence check
      if (signal.confidence < (this.config.minConfidence || 0)) {
        return false;
      }

      // Strength check
      if (signal.strength < (this.config.minStrength || 0)) {
        return false;
      }

      // Type check
      if (this.config.allowedTypes && 
          !this.config.allowedTypes.includes(signal.type)) {
        return false;
      }

      // Age check
      if (this.config.maxAge) {
        const age = Date.now() - signal.timestamp.getTime();
        if (age > this.config.maxAge) {
          return false;
        }
      }

      // Expiration check
      if (signal.expiresAt && new Date() > signal.expiresAt) {
        return false;
      }

      return true;
    });
  }

  /**
   * Sort signals by priority
   */
  prioritize(signals: Signal[]): Signal[] {
    return [...signals].sort((a, b) => {
      // First by strength
      if (b.strength !== a.strength) {
        return b.strength - a.strength;
      }
      // Then by confidence
      return b.confidence - a.confidence;
    });
  }
}
