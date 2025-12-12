/**
 * EdgePoly Strategies - Volatility Breakout Strategy
 * 
 * Captures explosive moves when markets break out of consolidation.
 * Uses volatility compression to identify breakout opportunities.
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
} from '../types';
import { 
  calculateBollingerBands, 
  calculateATR, 
  calculateSMA, 
  calculateHighLow 
} from '../utils/indicators';

export class VolatilityBreakoutStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: 'volatility-breakout-v1',
    name: 'Volatility Breakout',
    description: 'Identifies volatility compression and trades breakouts. Uses Bollinger Bandwidth, ATR, and price channels. Best for markets with pending catalysts.',
    category: 'momentum',
    riskLevel: 'high',
    timeHorizon: 'intraday',
    minCapital: 150,
    expectedReturn: {
      annual: 75,
      monthly: 6.25,
    },
    maxDrawdown: 35,
    winRate: 45,
    parameters: {
      compressionPeriod: {
        type: 'number',
        default: 20,
        min: 10,
        max: 50,
        description: 'Period for measuring volatility compression',
      },
      compressionThreshold: {
        type: 'number',
        default: 0.5,
        min: 0.2,
        max: 0.8,
        description: 'Bandwidth percentile for compression (lower = tighter)',
      },
      breakoutMultiplier: {
        type: 'number',
        default: 1.5,
        min: 1,
        max: 3,
        description: 'ATR multiplier for breakout confirmation',
      },
      channelPeriod: {
        type: 'number',
        default: 10,
        min: 5,
        max: 30,
        description: 'Period for Donchian-style channels',
      },
      volumeConfirmation: {
        type: 'boolean',
        default: true,
        description: 'Require volume expansion on breakout',
      },
      volumeMultiplier: {
        type: 'number',
        default: 1.5,
        min: 1.2,
        max: 3,
        description: 'Volume multiplier for confirmation',
      },
      trailingStop: {
        type: 'boolean',
        default: true,
        description: 'Use trailing stop instead of fixed',
      },
      trailingAtrMultiplier: {
        type: 'number',
        default: 2,
        min: 1,
        max: 4,
        description: 'ATR multiplier for trailing stop',
      },
      fixedStopPercent: {
        type: 'number',
        default: 8,
        min: 3,
        max: 15,
        description: 'Fixed stop loss percentage',
      },
      targetMultiplier: {
        type: 'number',
        default: 2.5,
        min: 1.5,
        max: 5,
        description: 'Risk:Reward ratio for target',
      },
      maxPositionSize: {
        type: 'number',
        default: 0.15,
        min: 0.05,
        max: 0.3,
        description: 'Maximum position size as % of capital',
      },
    },
    metadata: {
      author: 'EdgePoly Team',
      version: '1.0.0',
      lastUpdated: '2025-01-01',
    },
  };

  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private bandwidthHistory: Map<string, number[]> = new Map();
  private breakoutStates: Map<string, { direction: 'up' | 'down'; triggerPrice: number; timestamp: Date }> = new Map();

  protected async onInitialize(): Promise<void> {
    this.priceHistory.clear();
    this.volumeHistory.clear();
    this.bandwidthHistory.clear();
    this.breakoutStates.clear();
  }

  async analyze(market: MarketSnapshot): Promise<MarketAnalysis> {
    const primaryOutcome = market.outcomes[0];
    const prices = this.priceHistory.get(market.id) || [];

    prices.push(primaryOutcome.price);
    if (prices.length > 100) prices.shift();
    this.priceHistory.set(market.id, prices);

    const volumes = this.volumeHistory.get(market.id) || [];
    volumes.push(market.volume24h);
    if (volumes.length > 100) volumes.shift();
    this.volumeHistory.set(market.id, volumes);

    const technicals = this.calculateTechnicals(prices, primaryOutcome.price);
    const fundamentals = this.calculateFundamentals(market);
    const sentiment = this.calculateSentiment(prices, volumes);

    // Breakout scoring
    const compressionScore = this.scoreCompression(technicals);
    const breakoutScore = this.scoreBreakout(technicals, primaryOutcome.price, prices);
    const volumeScore = this.scoreVolume(volumes);

    const score = compressionScore * 0.3 + breakoutScore * 0.5 + volumeScore * 0.2;

    let recommendation: 'buy' | 'sell' | 'hold' | 'close' = 'hold';
    if (score > 40) recommendation = technicals.trend === 'bullish' ? 'buy' : 'sell';

    return {
      marketId: market.id,
      timestamp: new Date(),
      technicals,
      fundamentals,
      sentiment,
      score,
      recommendation,
    };
  }

  async generateSignals(markets: MarketSnapshot[]): Promise<Signal[]> {
    const signals: Signal[] = [];

    for (const market of markets) {
      if (market.resolved) continue;

      const analysis = await this.analyze(market);
      const signal = this.generateBreakoutSignal(market, analysis);

      if (signal) signals.push(signal);
    }

    return signals;
  }

  private generateBreakoutSignal(
    market: MarketSnapshot,
    analysis: MarketAnalysis
  ): Signal | null {
    const prices = this.priceHistory.get(market.id) || [];
    if (prices.length < 20) return null;

    const primaryOutcome = market.outcomes[0];
    const currentPrice = primaryOutcome.price;
    
    // Check for compression
    if (!this.isCompressed(market.id)) return null;

    // Check for breakout
    const breakout = this.detectBreakout(market.id, currentPrice, prices);
    if (!breakout) return null;

    // Volume confirmation
    if (this.getParameter<boolean>('volumeConfirmation')) {
      const volumes = this.volumeHistory.get(market.id) || [];
      if (!this.hasVolumeConfirmation(volumes)) return null;
    }

    const atr = analysis.technicals.indicators.atr;
    const stopDistance = this.getParameter<boolean>('trailingStop')
      ? atr * this.getParameter<number>('trailingAtrMultiplier')
      : currentPrice * (this.getParameter<number>('fixedStopPercent') / 100);

    const stopLoss = breakout.direction === 'up'
      ? currentPrice - stopDistance
      : currentPrice + stopDistance;

    const targetMultiplier = this.getParameter<number>('targetMultiplier');
    const targetDistance = stopDistance * targetMultiplier;
    const takeProfit = breakout.direction === 'up'
      ? currentPrice + targetDistance
      : currentPrice - targetDistance;

    const confidence = this.calculateConfidence(analysis, breakout);
    const strength = this.calculateStrength(analysis.score, confidence);

    return this.createSignal(
      market.id,
      primaryOutcome.id,
      breakout.direction === 'up' ? 'buy' : 'sell',
      strength,
      confidence,
      {
        entryPrice: currentPrice,
        stopLoss,
        takeProfit,
        reasoning: this.generateReasoning(analysis, breakout),
        indicators: {
          bandwidth: analysis.technicals.indicators.bandwidth,
          atr,
          channelHigh: analysis.technicals.indicators.channelHigh,
          channelLow: analysis.technicals.indicators.channelLow,
          compressionLevel: analysis.technicals.indicators.compressionLevel,
        },
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        metadata: {
          breakoutDirection: breakout.direction,
          breakoutPrice: breakout.triggerPrice,
          isTrailingStop: this.getParameter<boolean>('trailingStop'),
        },
      }
    );
  }

  private calculateTechnicals(prices: number[], currentPrice: number): TechnicalAnalysis {
    const compressionPeriod = this.getParameter<number>('compressionPeriod');
    const channelPeriod = this.getParameter<number>('channelPeriod');

    // Bollinger Bands
    const bb = calculateBollingerBands(prices, compressionPeriod, 2);
    const bandwidth = bb.upper !== bb.lower
      ? (bb.upper - bb.lower) / bb.middle
      : 0;

    // Track bandwidth history
    const bandwidthHist = this.bandwidthHistory.get(prices.toString()) || [];
    bandwidthHist.push(bandwidth);
    if (bandwidthHist.length > 50) bandwidthHist.shift();

    // ATR
    const atr = calculateATR(prices, 14);

    // Donchian-style channels
    const channel = calculateHighLow(prices, channelPeriod);

    // SMA
    const sma = calculateSMA(prices, compressionPeriod);

    // Compression level (0 = max compression, 1 = max expansion)
    const bandwidthMin = Math.min(...bandwidthHist.slice(-20));
    const bandwidthMax = Math.max(...bandwidthHist.slice(-20));
    const compressionLevel = bandwidthMax !== bandwidthMin
      ? (bandwidth - bandwidthMin) / (bandwidthMax - bandwidthMin)
      : 0.5;

    // Trend
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (currentPrice > channel.high * 0.98) trend = 'bullish';
    else if (currentPrice < channel.low * 1.02) trend = 'bearish';

    return {
      trend,
      momentum: (currentPrice - sma) / sma,
      volatility: atr / currentPrice,
      support: [bb.lower, channel.low],
      resistance: [bb.upper, channel.high],
      indicators: {
        bbUpper: bb.upper,
        bbMiddle: bb.middle,
        bbLower: bb.lower,
        bandwidth,
        atr,
        channelHigh: channel.high,
        channelLow: channel.low,
        sma,
        compressionLevel,
      },
    };
  }

  private calculateFundamentals(market: MarketSnapshot): FundamentalAnalysis {
    const primaryOutcome = market.outcomes[0];
    const timeToResolution = (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    return {
      impliedProbability: primaryOutcome.price,
      estimatedFairValue: primaryOutcome.price,
      mispricing: 0,
      volume: market.volume24h,
      liquidity: market.liquidity,
      timeToResolution,
    };
  }

  private calculateSentiment(prices: number[], volumes: number[]): SentimentAnalysis {
    const recentPrices = prices.slice(-5);
    const avgRecent = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const avgTotal = prices.reduce((a, b) => a + b, 0) / prices.length;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (avgRecent > avgTotal * 1.02) trend = 'improving';
    else if (avgRecent < avgTotal * 0.98) trend = 'declining';

    const recentVolume = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    let volumeTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentVolume > avgVolume * 1.3) volumeTrend = 'increasing';
    else if (recentVolume < avgVolume * 0.7) volumeTrend = 'decreasing';

    return {
      score: 0,
      trend,
      volumeTrend,
      priceAction: 'neutral',
    };
  }

  private isCompressed(marketId: string): boolean {
    const prices = this.priceHistory.get(marketId) || [];
    if (prices.length < 20) return false;

    const bb = calculateBollingerBands(prices, 20, 2);
    const bandwidth = (bb.upper - bb.lower) / bb.middle;

    // Check if bandwidth is in bottom percentile
    const threshold = this.getParameter<number>('compressionThreshold');
    const bandwidthHist = this.bandwidthHistory.get(marketId) || [];
    
    if (bandwidthHist.length < 10) return bandwidth < 0.1;

    const sorted = [...bandwidthHist].sort((a, b) => a - b);
    const thresholdValue = sorted[Math.floor(sorted.length * threshold)];

    return bandwidth <= thresholdValue;
  }

  private detectBreakout(
    marketId: string,
    currentPrice: number,
    prices: number[]
  ): { direction: 'up' | 'down'; triggerPrice: number } | null {
    const channelPeriod = this.getParameter<number>('channelPeriod');
    const breakoutMultiplier = this.getParameter<number>('breakoutMultiplier');
    const atr = calculateATR(prices, 14);

    const channel = calculateHighLow(prices.slice(0, -1), channelPeriod);
    const breakoutDistance = atr * breakoutMultiplier;

    // Check for upside breakout
    if (currentPrice > channel.high + breakoutDistance * 0.5) {
      return { direction: 'up', triggerPrice: channel.high };
    }

    // Check for downside breakout
    if (currentPrice < channel.low - breakoutDistance * 0.5) {
      return { direction: 'down', triggerPrice: channel.low };
    }

    return null;
  }

  private hasVolumeConfirmation(volumes: number[]): boolean {
    if (volumes.length < 5) return true;

    const recentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 
                      Math.min(19, volumes.length - 1);

    const multiplier = this.getParameter<number>('volumeMultiplier');
    return recentVolume >= avgVolume * multiplier;
  }

  private scoreCompression(technicals: TechnicalAnalysis): number {
    const compressionLevel = technicals.indicators.compressionLevel;
    
    // Lower compression = higher score
    if (compressionLevel < 0.1) return 100;
    if (compressionLevel < 0.2) return 80;
    if (compressionLevel < 0.3) return 60;
    if (compressionLevel < 0.4) return 40;
    if (compressionLevel < 0.5) return 20;
    return 0;
  }

  private scoreBreakout(
    technicals: TechnicalAnalysis,
    currentPrice: number,
    prices: number[]
  ): number {
    const channel = calculateHighLow(prices.slice(0, -1), 10);
    const atr = technicals.indicators.atr;

    let score = 0;

    // Price position relative to channel
    if (currentPrice > channel.high) {
      score += 50 + ((currentPrice - channel.high) / atr) * 25;
    } else if (currentPrice < channel.low) {
      score += 50 + ((channel.low - currentPrice) / atr) * 25;
    }

    // Momentum confirmation
    if (Math.abs(technicals.momentum) > 0.05) {
      score += 20;
    }

    return Math.min(100, score);
  }

  private scoreVolume(volumes: number[]): number {
    if (volumes.length < 5) return 50;

    const recentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 
                      Math.min(19, volumes.length - 1);

    const ratio = recentVolume / avgVolume;

    if (ratio >= 2) return 100;
    if (ratio >= 1.5) return 75;
    if (ratio >= 1.2) return 50;
    if (ratio >= 1) return 25;
    return 0;
  }

  private calculateConfidence(
    analysis: MarketAnalysis,
    breakout: { direction: string; triggerPrice: number }
  ): number {
    let confidence = 0.5;

    // Score contribution
    confidence += analysis.score / 200;

    // Compression quality
    const compressionLevel = analysis.technicals.indicators.compressionLevel;
    if (compressionLevel < 0.2) confidence += 0.15;
    else if (compressionLevel < 0.3) confidence += 0.1;

    // Trend alignment
    if ((breakout.direction === 'up' && analysis.technicals.trend === 'bullish') ||
        (breakout.direction === 'down' && analysis.technicals.trend === 'bearish')) {
      confidence += 0.1;
    }

    return Math.min(0.85, confidence);
  }

  private calculateStrength(score: number, confidence: number): 1 | 2 | 3 | 4 | 5 {
    const combined = score * confidence;
    if (combined >= 60) return 5;
    if (combined >= 45) return 4;
    if (combined >= 30) return 3;
    if (combined >= 15) return 2;
    return 1;
  }

  private generateReasoning(
    analysis: MarketAnalysis,
    breakout: { direction: string; triggerPrice: number }
  ): string {
    const parts: string[] = [];

    parts.push(`${breakout.direction.toUpperCase()} breakout at ${breakout.triggerPrice.toFixed(3)}`);
    parts.push(`Compression: ${((1 - analysis.technicals.indicators.compressionLevel) * 100).toFixed(0)}%`);
    parts.push(`Bandwidth: ${(analysis.technicals.indicators.bandwidth * 100).toFixed(2)}%`);
    parts.push(`ATR: ${analysis.technicals.indicators.atr.toFixed(4)}`);
    parts.push(`Trend: ${analysis.technicals.trend}`);

    return parts.join(' | ');
  }

  protected async onValidateSignal(signal: Signal): Promise<boolean> {
    // Verify breakout is still valid
    const prices = this.priceHistory.get(signal.marketId) || [];
    if (prices.length === 0) return false;

    const currentPrice = prices[prices.length - 1];
    const breakoutDirection = signal.metadata?.breakoutDirection as string;
    const breakoutPrice = signal.metadata?.breakoutPrice as number;

    // Price should still be beyond breakout level
    if (breakoutDirection === 'up' && currentPrice < breakoutPrice) return false;
    if (breakoutDirection === 'down' && currentPrice > breakoutPrice) return false;

    return true;
  }

  protected onSignalResult(_signal: Signal, _result: SignalResult): void {
    // Track breakout success rates
  }

  protected calculateCurrentExposure(): number {
    return this.activePositions * 0.15;
  }
}

export const volatilityBreakoutStrategy = new VolatilityBreakoutStrategy();
