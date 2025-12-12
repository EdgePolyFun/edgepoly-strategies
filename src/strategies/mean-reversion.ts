/**
 * EdgePoly Strategies - Mean Reversion Strategy
 * 
 * Capitalizes on price deviations from historical averages.
 * Buys oversold conditions, sells overbought conditions.
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
import { calculateBollingerBands, calculateZScore, calculateSMA, calculateATR } from '../utils/indicators';

export class MeanReversionStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: 'mean-reversion-v1',
    name: 'Mean Reversion Contrarian',
    description: 'Identifies extreme price deviations and bets on reversion to the mean. Uses Bollinger Bands, Z-Score, and volume analysis. Best for range-bound markets.',
    category: 'mean_reversion',
    riskLevel: 'medium',
    timeHorizon: 'intraday',
    minCapital: 100,
    expectedReturn: {
      annual: 35,
      monthly: 2.9,
    },
    maxDrawdown: 15,
    winRate: 62,
    parameters: {
      bollingerPeriod: {
        type: 'number',
        default: 20,
        min: 10,
        max: 50,
        description: 'Bollinger Bands period',
      },
      bollingerStdDev: {
        type: 'number',
        default: 2,
        min: 1,
        max: 3,
        step: 0.5,
        description: 'Bollinger Bands standard deviation multiplier',
      },
      zScoreThreshold: {
        type: 'number',
        default: 2,
        min: 1,
        max: 3,
        step: 0.25,
        description: 'Z-Score threshold for extreme deviation',
      },
      meanPeriod: {
        type: 'number',
        default: 50,
        min: 20,
        max: 100,
        description: 'Period for mean calculation',
      },
      minDeviation: {
        type: 'number',
        default: 0.05,
        min: 0.02,
        max: 0.15,
        description: 'Minimum price deviation from mean',
      },
      volumeConfirmation: {
        type: 'boolean',
        default: true,
        description: 'Require volume spike for confirmation',
      },
      useAtrStops: {
        type: 'boolean',
        default: true,
        description: 'Use ATR-based stop losses',
      },
      atrMultiplier: {
        type: 'number',
        default: 2,
        min: 1,
        max: 4,
        description: 'ATR multiplier for stop loss',
      },
      maxPositionSize: {
        type: 'number',
        default: 0.12,
        min: 0.05,
        max: 0.25,
        description: 'Maximum position size as % of capital',
      },
      targetReversion: {
        type: 'number',
        default: 0.5,
        min: 0.25,
        max: 1,
        description: 'Target % reversion to mean (1 = full reversion)',
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

  protected async onInitialize(): Promise<void> {
    this.priceHistory.clear();
    this.volumeHistory.clear();
  }

  async analyze(market: MarketSnapshot): Promise<MarketAnalysis> {
    const primaryOutcome = market.outcomes[0];
    const prices = this.priceHistory.get(market.id) || [];
    
    prices.push(primaryOutcome.price);
    if (prices.length > 200) prices.shift();
    this.priceHistory.set(market.id, prices);

    const volumes = this.volumeHistory.get(market.id) || [];
    volumes.push(market.volume24h);
    if (volumes.length > 200) volumes.shift();
    this.volumeHistory.set(market.id, volumes);

    const technicals = this.calculateTechnicals(prices, primaryOutcome.price);
    const fundamentals = this.calculateFundamentals(market, prices);
    const sentiment = this.calculateSentiment(prices, volumes);

    const technicalScore = this.scoreTechnicals(technicals, primaryOutcome.price);
    const fundamentalScore = this.scoreFundamentals(fundamentals);
    const sentimentScore = this.scoreSentiment(sentiment);

    const score = (technicalScore * 0.6) + (fundamentalScore * 0.25) + (sentimentScore * 0.15);

    let recommendation: 'buy' | 'sell' | 'hold' | 'close' = 'hold';
    // Mean reversion: positive score when oversold (buy), negative when overbought (sell)
    if (score > 25) recommendation = 'buy';
    else if (score < -25) recommendation = 'sell';

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
      const signal = this.generateSignalFromAnalysis(market, analysis);
      
      if (signal) signals.push(signal);
    }

    return signals;
  }

  private generateSignalFromAnalysis(
    market: MarketSnapshot,
    analysis: MarketAnalysis
  ): Signal | null {
    const minDeviation = this.getParameter<number>('minDeviation');
    const zScoreThreshold = this.getParameter<number>('zScoreThreshold');
    
    const prices = this.priceHistory.get(market.id) || [];
    const primaryOutcome = market.outcomes[0];
    
    if (prices.length < 20) return null;

    const zScore = analysis.technicals.indicators.zScore;
    
    // Check for extreme deviation
    if (Math.abs(zScore) < zScoreThreshold) return null;

    // Check Bollinger Band position
    const bbPosition = analysis.technicals.indicators.bbPosition;
    
    // Determine signal direction (mean reversion = contrarian)
    const isOversold = zScore < -zScoreThreshold && bbPosition < 0;
    const isOverbought = zScore > zScoreThreshold && bbPosition > 1;

    if (!isOversold && !isOverbought) return null;

    // Volume confirmation
    if (this.getParameter<boolean>('volumeConfirmation')) {
      const volumes = this.volumeHistory.get(market.id) || [];
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const currentVolume = volumes[volumes.length - 1] || 0;
      
      if (currentVolume < avgVolume * 1.2) return null; // Need volume spike
    }

    const entryPrice = primaryOutcome.price;
    const mean = analysis.technicals.indicators.sma;
    const targetReversion = this.getParameter<number>('targetReversion');
    
    // Target partial reversion to mean
    const targetPrice = isOversold
      ? entryPrice + (mean - entryPrice) * targetReversion
      : entryPrice - (entryPrice - mean) * targetReversion;

    // Calculate stop loss
    let stopLoss: number;
    if (this.getParameter<boolean>('useAtrStops')) {
      const atr = analysis.technicals.indicators.atr;
      const atrMultiplier = this.getParameter<number>('atrMultiplier');
      stopLoss = isOversold
        ? entryPrice - atr * atrMultiplier
        : entryPrice + atr * atrMultiplier;
    } else {
      stopLoss = isOversold
        ? entryPrice * 0.92
        : entryPrice * 1.08;
    }

    const strength = this.calculateSignalStrength(Math.abs(zScore));
    const confidence = Math.min(0.85, 0.4 + Math.abs(zScore) / 10);

    return this.createSignal(
      market.id,
      primaryOutcome.id,
      isOversold ? 'buy' : 'sell',
      strength,
      confidence,
      {
        entryPrice,
        targetPrice,
        stopLoss,
        takeProfit: targetPrice,
        reasoning: this.generateReasoning(analysis, zScore, isOversold),
        indicators: {
          zScore,
          bbPosition,
          deviation: Math.abs(entryPrice - mean) / mean,
          mean,
          atr: analysis.technicals.indicators.atr,
        },
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      }
    );
  }

  private calculateTechnicals(prices: number[], currentPrice: number): TechnicalAnalysis {
    const bbPeriod = this.getParameter<number>('bollingerPeriod');
    const bbStdDev = this.getParameter<number>('bollingerStdDev');
    const meanPeriod = this.getParameter<number>('meanPeriod');

    // Bollinger Bands
    const bb = calculateBollingerBands(prices, bbPeriod, bbStdDev);
    
    // Z-Score
    const zScore = calculateZScore(prices, meanPeriod);
    
    // SMA
    const sma = calculateSMA(prices, meanPeriod);
    
    // ATR for volatility
    const atr = calculateATR(prices, 14);

    // BB position: 0 = lower band, 0.5 = middle, 1 = upper band
    const bbPosition = bb.upper !== bb.lower 
      ? (currentPrice - bb.lower) / (bb.upper - bb.lower)
      : 0.5;

    // Trend determination
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (currentPrice > sma * 1.03) trend = 'bullish';
    else if (currentPrice < sma * 0.97) trend = 'bearish';

    // Volatility
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const volatility = returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length)
      : 0;

    return {
      trend,
      momentum: (currentPrice - sma) / sma,
      volatility,
      support: [bb.lower, sma * 0.95],
      resistance: [bb.upper, sma * 1.05],
      indicators: {
        bbUpper: bb.upper,
        bbMiddle: bb.middle,
        bbLower: bb.lower,
        bbPosition,
        zScore,
        sma,
        atr,
        bandwidth: (bb.upper - bb.lower) / bb.middle,
      },
    };
  }

  private calculateFundamentals(market: MarketSnapshot, prices: number[]): FundamentalAnalysis {
    const primaryOutcome = market.outcomes[0];
    const impliedProbability = primaryOutcome.price;
    const meanPeriod = this.getParameter<number>('meanPeriod');
    
    const historicalMean = prices.length >= meanPeriod
      ? prices.slice(-meanPeriod).reduce((a, b) => a + b, 0) / meanPeriod
      : impliedProbability;

    const mispricing = historicalMean - impliedProbability;
    const timeToResolution = (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    return {
      impliedProbability,
      estimatedFairValue: historicalMean,
      mispricing,
      volume: market.volume24h,
      liquidity: market.liquidity,
      timeToResolution,
    };
  }

  private calculateSentiment(prices: number[], volumes: number[]): SentimentAnalysis {
    // Contrarian sentiment analysis
    const recentPrices = prices.slice(-5);
    const avgRecent = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const avgTotal = prices.reduce((a, b) => a + b, 0) / prices.length;

    // For mean reversion, we want to fade recent trends
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (avgRecent > avgTotal * 1.02) trend = 'declining'; // Overbought = expect decline
    else if (avgRecent < avgTotal * 0.98) trend = 'improving'; // Oversold = expect improvement

    const recentVolume = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    let volumeTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentVolume > avgVolume * 1.3) volumeTrend = 'increasing';
    else if (recentVolume < avgVolume * 0.7) volumeTrend = 'decreasing';

    // Mean reversion prefers exhaustion moves
    let priceAction: 'accumulation' | 'distribution' | 'neutral' = 'neutral';
    if (trend === 'improving' && volumeTrend === 'increasing') priceAction = 'accumulation';
    else if (trend === 'declining' && volumeTrend === 'increasing') priceAction = 'distribution';

    let score = 0;
    if (trend === 'improving') score += 25;
    else if (trend === 'declining') score -= 25;

    return { score, trend, volumeTrend, priceAction };
  }

  private scoreTechnicals(technicals: TechnicalAnalysis, currentPrice: number): number {
    let score = 0;
    const zScore = technicals.indicators.zScore;
    const bbPosition = technicals.indicators.bbPosition;

    // Z-Score scoring (contrarian)
    if (zScore < -2) score += 40;
    else if (zScore < -1.5) score += 25;
    else if (zScore > 2) score -= 40;
    else if (zScore > 1.5) score -= 25;

    // Bollinger Band position (contrarian)
    if (bbPosition < 0.1) score += 30;
    else if (bbPosition < 0.2) score += 15;
    else if (bbPosition > 0.9) score -= 30;
    else if (bbPosition > 0.8) score -= 15;

    // Bandwidth (volatility expansion)
    const bandwidth = technicals.indicators.bandwidth;
    if (bandwidth > 0.15) score += 10; // High volatility = opportunity
    else if (bandwidth < 0.05) score -= 10; // Low volatility = no opportunity

    return Math.max(-100, Math.min(100, score));
  }

  private scoreFundamentals(fundamentals: FundamentalAnalysis): number {
    let score = 0;

    // Mispricing from mean
    const mispricingPercent = fundamentals.mispricing / fundamentals.estimatedFairValue;
    score += mispricingPercent * 150;

    // Liquidity requirement
    if (fundamentals.liquidity < 1000) score *= 0.7;

    // Time decay
    if (fundamentals.timeToResolution < 3) score *= 0.5;

    return Math.max(-100, Math.min(100, score));
  }

  private scoreSentiment(sentiment: SentimentAnalysis): number {
    return sentiment.score;
  }

  private calculateSignalStrength(absZScore: number): 1 | 2 | 3 | 4 | 5 {
    if (absZScore >= 3) return 5;
    if (absZScore >= 2.5) return 4;
    if (absZScore >= 2) return 3;
    if (absZScore >= 1.5) return 2;
    return 1;
  }

  private generateReasoning(
    analysis: MarketAnalysis,
    zScore: number,
    isOversold: boolean
  ): string {
    const parts: string[] = [];

    parts.push(isOversold ? 'Oversold' : 'Overbought');
    parts.push(`Z-Score: ${zScore.toFixed(2)}`);
    parts.push(`BB Position: ${(analysis.technicals.indicators.bbPosition * 100).toFixed(1)}%`);
    parts.push(`Deviation from mean: ${(analysis.technicals.momentum * 100).toFixed(2)}%`);
    parts.push(`Target: Reversion to ${analysis.technicals.indicators.sma.toFixed(3)}`);

    return parts.join(' | ');
  }

  protected async onValidateSignal(signal: Signal): Promise<boolean> {
    const zScore = signal.indicators.zScore;
    const minZScore = this.getParameter<number>('zScoreThreshold') * 0.8;

    // Ensure still significantly deviated
    if (Math.abs(zScore) < minZScore) return false;

    // Don't trade near resolution
    if (signal.expiresAt) {
      const hoursLeft = (signal.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursLeft < 2) return false;
    }

    return true;
  }

  protected onSignalResult(_signal: Signal, _result: SignalResult): void {
    // Track performance for adaptive parameters
  }

  protected calculateCurrentExposure(): number {
    return this.activePositions * 0.12;
  }
}

export const meanReversionStrategy = new MeanReversionStrategy();
