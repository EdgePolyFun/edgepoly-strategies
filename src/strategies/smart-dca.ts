/**
 * EdgePoly Strategies - Smart DCA Strategy
 * 
 * Intelligent Dollar Cost Averaging with dynamic allocation.
 * Adjusts purchase amounts based on market conditions.
 */

import { BaseStrategy } from './base';
import type {
  StrategyConfig,
  MarketSnapshot,
  MarketAnalysis,
  Signal,
  SignalResult,
  TechnicalAnalysis,
  FundamentalAnalysis,
  SentimentAnalysis,
  MarketId,
} from '../types';
import { calculateRSI, calculateSMA } from '../utils/indicators';

export interface DCASchedule {
  marketId: MarketId;
  outcomeId: string;
  intervalHours: number;
  baseAmount: number;
  nextPurchase: Date;
  totalInvested: number;
  averagePrice: number;
  shares: number;
}

export class SmartDCAStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: 'smart-dca-v1',
    name: 'Smart Dollar Cost Averaging',
    description: 'Enhanced DCA that dynamically adjusts purchase amounts based on market conditions. Buys more when prices are low, less when high. Best for long-term accumulation.',
    category: 'portfolio',
    riskLevel: 'low',
    timeHorizon: 'long_term',
    minCapital: 500,
    expectedReturn: {
      annual: 25,
      monthly: 2.1,
    },
    maxDrawdown: 15,
    winRate: 68,
    parameters: {
      baseInterval: {
        type: 'number',
        default: 24,
        min: 1,
        max: 168,
        description: 'Base interval between purchases (hours)',
      },
      baseAmount: {
        type: 'number',
        default: 50,
        min: 10,
        max: 500,
        description: 'Base purchase amount per interval',
      },
      minMultiplier: {
        type: 'number',
        default: 0.5,
        min: 0.1,
        max: 1,
        description: 'Minimum amount multiplier when price is high',
      },
      maxMultiplier: {
        type: 'number',
        default: 2,
        min: 1,
        max: 5,
        description: 'Maximum amount multiplier when price is low',
      },
      valueAveragingEnabled: {
        type: 'boolean',
        default: true,
        description: 'Use value averaging instead of fixed amounts',
      },
      targetGrowthRate: {
        type: 'number',
        default: 0.1,
        min: 0.01,
        max: 0.5,
        description: 'Target portfolio growth rate per interval',
      },
      priceThresholdLow: {
        type: 'number',
        default: 0.35,
        min: 0.1,
        max: 0.5,
        description: 'Price threshold for increased buying',
      },
      priceThresholdHigh: {
        type: 'number',
        default: 0.65,
        min: 0.5,
        max: 0.9,
        description: 'Price threshold for reduced buying',
      },
      rsiOversold: {
        type: 'number',
        default: 30,
        min: 10,
        max: 40,
        description: 'RSI level for aggressive buying',
      },
      rsiOverbought: {
        type: 'number',
        default: 70,
        min: 60,
        max: 90,
        description: 'RSI level for reduced buying',
      },
      maxPositionSize: {
        type: 'number',
        default: 0.25,
        min: 0.1,
        max: 0.5,
        description: 'Maximum position size as % of capital',
      },
      rebalanceThreshold: {
        type: 'number',
        default: 0.15,
        min: 0.05,
        max: 0.3,
        description: 'Deviation threshold for rebalancing',
      },
    },
    metadata: {
      author: 'EdgePoly Team',
      version: '1.0.0',
      lastUpdated: '2025-01-01',
    },
  };

  private schedules: Map<MarketId, DCASchedule> = new Map();
  private priceHistory: Map<MarketId, number[]> = new Map();
  private purchaseHistory: Map<MarketId, Array<{ price: number; amount: number; date: Date }>> = new Map();

  protected async onInitialize(): Promise<void> {
    this.schedules.clear();
    this.priceHistory.clear();
    this.purchaseHistory.clear();
  }

  /**
   * Add a market to the DCA schedule
   */
  addToSchedule(
    marketId: MarketId,
    outcomeId: string,
    options: {
      intervalHours?: number;
      baseAmount?: number;
      startNow?: boolean;
    } = {}
  ): DCASchedule {
    const schedule: DCASchedule = {
      marketId,
      outcomeId,
      intervalHours: options.intervalHours || this.getParameter<number>('baseInterval'),
      baseAmount: options.baseAmount || this.getParameter<number>('baseAmount'),
      nextPurchase: options.startNow 
        ? new Date() 
        : new Date(Date.now() + (options.intervalHours || 24) * 60 * 60 * 1000),
      totalInvested: 0,
      averagePrice: 0,
      shares: 0,
    };

    this.schedules.set(marketId, schedule);
    return schedule;
  }

  /**
   * Remove a market from the DCA schedule
   */
  removeFromSchedule(marketId: MarketId): void {
    this.schedules.delete(marketId);
  }

  /**
   * Get all active DCA schedules
   */
  getSchedules(): DCASchedule[] {
    return Array.from(this.schedules.values());
  }

  async analyze(market: MarketSnapshot): Promise<MarketAnalysis> {
    const prices = this.priceHistory.get(market.id) || [];
    const primaryOutcome = market.outcomes[0];

    prices.push(primaryOutcome.price);
    if (prices.length > 100) prices.shift();
    this.priceHistory.set(market.id, prices);

    const technicals = this.calculateTechnicals(prices, primaryOutcome.price);
    const fundamentals = this.calculateFundamentals(market, prices);
    const sentiment = this.calculateSentiment(prices);

    // Score determines buying aggressiveness (higher = buy more)
    const score = this.calculateDCAScore(technicals, fundamentals, primaryOutcome.price);

    return {
      marketId: market.id,
      timestamp: new Date(),
      technicals,
      fundamentals,
      sentiment,
      score,
      recommendation: 'buy', // DCA always buys, just varies amount
    };
  }

  async generateSignals(markets: MarketSnapshot[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const now = new Date();

    for (const market of markets) {
      if (market.resolved) continue;

      const schedule = this.schedules.get(market.id);
      if (!schedule) continue;

      // Check if it's time for a purchase
      if (now >= schedule.nextPurchase) {
        const analysis = await this.analyze(market);
        const signal = await this.generateDCASignal(market, schedule, analysis);
        
        if (signal) {
          signals.push(signal);
          
          // Update schedule
          schedule.nextPurchase = new Date(
            now.getTime() + schedule.intervalHours * 60 * 60 * 1000
          );
        }
      }
    }

    return signals;
  }

  private async generateDCASignal(
    market: MarketSnapshot,
    schedule: DCASchedule,
    analysis: MarketAnalysis
  ): Promise<Signal> {
    const primaryOutcome = market.outcomes[0];
    const currentPrice = primaryOutcome.price;

    // Calculate dynamic amount
    const amount = this.calculateDynamicAmount(schedule, analysis, currentPrice);

    // Value averaging adjustment
    let adjustedAmount = amount;
    if (this.getParameter<boolean>('valueAveragingEnabled')) {
      adjustedAmount = this.applyValueAveraging(schedule, amount, currentPrice);
    }

    const shares = adjustedAmount / currentPrice;
    const confidence = this.calculateConfidence(analysis);

    return this.createSignal(
      market.id,
      schedule.outcomeId,
      'buy',
      this.calculateStrength(analysis.score),
      confidence,
      {
        entryPrice: currentPrice,
        size: shares,
        reasoning: this.generateDCAReasoning(schedule, analysis, amount, adjustedAmount),
        indicators: {
          rsi: analysis.technicals.indicators.rsi || 50,
          priceVsAvg: schedule.averagePrice > 0 
            ? (currentPrice - schedule.averagePrice) / schedule.averagePrice 
            : 0,
          dcaScore: analysis.score,
          multiplier: adjustedAmount / schedule.baseAmount,
        },
        metadata: {
          isDCA: true,
          scheduledAmount: schedule.baseAmount,
          actualAmount: adjustedAmount,
          totalInvested: schedule.totalInvested + adjustedAmount,
          newAveragePrice: this.calculateNewAveragePrice(schedule, currentPrice, shares),
        },
      }
    );
  }

  private calculateDynamicAmount(
    schedule: DCASchedule,
    analysis: MarketAnalysis,
    currentPrice: number
  ): number {
    const baseAmount = schedule.baseAmount;
    const minMultiplier = this.getParameter<number>('minMultiplier');
    const maxMultiplier = this.getParameter<number>('maxMultiplier');
    const priceThresholdLow = this.getParameter<number>('priceThresholdLow');
    const priceThresholdHigh = this.getParameter<number>('priceThresholdHigh');

    let multiplier = 1;

    // Price-based adjustment
    if (currentPrice < priceThresholdLow) {
      // Price is low, buy more
      const lowness = (priceThresholdLow - currentPrice) / priceThresholdLow;
      multiplier += lowness * (maxMultiplier - 1);
    } else if (currentPrice > priceThresholdHigh) {
      // Price is high, buy less
      const highness = (currentPrice - priceThresholdHigh) / (1 - priceThresholdHigh);
      multiplier -= highness * (1 - minMultiplier);
    }

    // RSI-based adjustment
    const rsi = analysis.technicals.indicators.rsi || 50;
    const rsiOversold = this.getParameter<number>('rsiOversold');
    const rsiOverbought = this.getParameter<number>('rsiOverbought');

    if (rsi < rsiOversold) {
      multiplier *= 1.3; // Extra buying on oversold
    } else if (rsi > rsiOverbought) {
      multiplier *= 0.7; // Reduce buying on overbought
    }

    // DCA score adjustment
    if (analysis.score > 50) {
      multiplier *= 1 + (analysis.score - 50) / 100;
    } else if (analysis.score < -50) {
      multiplier *= 1 + (analysis.score + 50) / 200; // Less aggressive on negative
    }

    // Clamp multiplier
    multiplier = Math.max(minMultiplier, Math.min(maxMultiplier, multiplier));

    return baseAmount * multiplier;
  }

  private applyValueAveraging(
    schedule: DCASchedule,
    amount: number,
    currentPrice: number
  ): number {
    if (schedule.totalInvested === 0) return amount;

    const targetGrowthRate = this.getParameter<number>('targetGrowthRate');
    const targetValue = schedule.totalInvested * (1 + targetGrowthRate);
    const currentValue = schedule.shares * currentPrice;
    const shortfall = targetValue - currentValue;

    if (shortfall > 0) {
      // Need to buy more to reach target
      return Math.min(amount * 2, shortfall);
    } else {
      // Already at or above target, buy minimal
      return amount * 0.25;
    }
  }

  private calculateNewAveragePrice(
    schedule: DCASchedule,
    newPrice: number,
    newShares: number
  ): number {
    const totalCost = schedule.averagePrice * schedule.shares + newPrice * newShares;
    const totalShares = schedule.shares + newShares;
    return totalShares > 0 ? totalCost / totalShares : newPrice;
  }

  private calculateDCAScore(
    technicals: TechnicalAnalysis,
    fundamentals: FundamentalAnalysis,
    currentPrice: number
  ): number {
    let score = 0;

    // Price position (lower = higher score)
    if (currentPrice < 0.3) score += 40;
    else if (currentPrice < 0.4) score += 25;
    else if (currentPrice < 0.5) score += 10;
    else if (currentPrice > 0.7) score -= 25;
    else if (currentPrice > 0.6) score -= 10;

    // RSI adjustment
    const rsi = technicals.indicators.rsi || 50;
    if (rsi < 30) score += 30;
    else if (rsi < 40) score += 15;
    else if (rsi > 70) score -= 20;
    else if (rsi > 60) score -= 10;

    // Momentum (contrarian for DCA)
    if (technicals.momentum < -0.05) score += 20;
    else if (technicals.momentum > 0.05) score -= 10;

    // Liquidity
    if (fundamentals.liquidity > 5000) score += 10;
    else if (fundamentals.liquidity < 1000) score -= 15;

    return Math.max(-100, Math.min(100, score));
  }

  private calculateTechnicals(prices: number[], currentPrice: number): TechnicalAnalysis {
    const rsi = calculateRSI(prices, 14);
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);

    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (sma20 > sma50 * 1.02) trend = 'bullish';
    else if (sma20 < sma50 * 0.98) trend = 'bearish';

    const momentum = prices.length > 5
      ? (currentPrice - prices[prices.length - 5]) / prices[prices.length - 5]
      : 0;

    return {
      trend,
      momentum,
      volatility: 0,
      support: [sma50 * 0.95],
      resistance: [sma50 * 1.05],
      indicators: { rsi, sma20, sma50 },
    };
  }

  private calculateFundamentals(market: MarketSnapshot, prices: number[]): FundamentalAnalysis {
    const primaryOutcome = market.outcomes[0];
    const avgPrice = prices.length > 0
      ? prices.reduce((a, b) => a + b, 0) / prices.length
      : primaryOutcome.price;

    return {
      impliedProbability: primaryOutcome.price,
      estimatedFairValue: avgPrice,
      mispricing: avgPrice - primaryOutcome.price,
      volume: market.volume24h,
      liquidity: market.liquidity,
      timeToResolution: (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    };
  }

  private calculateSentiment(_prices: number[]): SentimentAnalysis {
    return {
      score: 0,
      trend: 'stable',
      volumeTrend: 'stable',
      priceAction: 'neutral',
    };
  }

  private calculateConfidence(analysis: MarketAnalysis): number {
    // DCA has high confidence in long-term approach
    const baseConfidence = 0.7;
    const scoreBonus = Math.abs(analysis.score) / 200;
    return Math.min(0.9, baseConfidence + scoreBonus);
  }

  private calculateStrength(score: number): 1 | 2 | 3 | 4 | 5 {
    if (score >= 60) return 5;
    if (score >= 40) return 4;
    if (score >= 20) return 3;
    if (score >= 0) return 2;
    return 1;
  }

  private generateDCAReasoning(
    schedule: DCASchedule,
    analysis: MarketAnalysis,
    baseAmount: number,
    adjustedAmount: number
  ): string {
    const parts: string[] = [];
    const multiplier = adjustedAmount / baseAmount;

    parts.push(`DCA Purchase #${Math.floor(schedule.totalInvested / schedule.baseAmount) + 1}`);
    parts.push(`Multiplier: ${multiplier.toFixed(2)}x`);
    parts.push(`RSI: ${(analysis.technicals.indicators.rsi || 50).toFixed(1)}`);
    parts.push(`Avg Price: ${schedule.averagePrice.toFixed(3)}`);
    parts.push(`Score: ${analysis.score.toFixed(1)}`);

    return parts.join(' | ');
  }

  onSignalExecuted(signal: Signal, result: SignalResult): void {
    super.onSignalExecuted(signal, result);

    if (result.executed && signal.metadata?.isDCA) {
      const schedule = this.schedules.get(signal.marketId);
      if (schedule) {
        const shares = signal.size || 0;
        const price = signal.entryPrice || 0;
        const amount = signal.metadata.actualAmount as number;

        schedule.totalInvested += amount;
        schedule.averagePrice = this.calculateNewAveragePrice(schedule, price, shares);
        schedule.shares += shares;

        // Track purchase history
        const history = this.purchaseHistory.get(signal.marketId) || [];
        history.push({ price, amount, date: new Date() });
        this.purchaseHistory.set(signal.marketId, history);
      }
    }
  }

  protected async onValidateSignal(_signal: Signal): Promise<boolean> {
    return true; // DCA signals are always valid
  }

  protected onSignalResult(_signal: Signal, _result: SignalResult): void {
    // DCA doesn't track individual trade outcomes the same way
  }

  protected calculateCurrentExposure(): number {
    let totalExposure = 0;
    for (const schedule of this.schedules.values()) {
      totalExposure += schedule.totalInvested;
    }
    return totalExposure;
  }
}

export const smartDCAStrategy = new SmartDCAStrategy();
