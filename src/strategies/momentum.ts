/**
 * EdgePoly Strategies - Momentum Strategy
 * 
 * Identifies and follows price trends in prediction markets.
 * Buys into strength, sells into weakness.
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
import { calculateRSI, calculateMACD, calculateSMA, calculateEMA } from '../utils/indicators';

export class MomentumStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: 'momentum-v1',
    name: 'Momentum Trend Follower',
    description: 'Identifies strong price trends and follows them. Uses RSI, MACD, and price action to confirm momentum. Best for markets with clear directional bias.',
    category: 'momentum',
    riskLevel: 'medium',
    timeHorizon: 'swing',
    minCapital: 100,
    expectedReturn: {
      annual: 45,
      monthly: 3.75,
    },
    maxDrawdown: 20,
    winRate: 55,
    parameters: {
      rsiPeriod: {
        type: 'number',
        default: 14,
        min: 5,
        max: 30,
        description: 'RSI calculation period',
      },
      rsiOverbought: {
        type: 'number',
        default: 70,
        min: 60,
        max: 90,
        description: 'RSI overbought threshold',
      },
      rsiOversold: {
        type: 'number',
        default: 30,
        min: 10,
        max: 40,
        description: 'RSI oversold threshold',
      },
      macdFast: {
        type: 'number',
        default: 12,
        min: 5,
        max: 20,
        description: 'MACD fast period',
      },
      macdSlow: {
        type: 'number',
        default: 26,
        min: 15,
        max: 40,
        description: 'MACD slow period',
      },
      macdSignal: {
        type: 'number',
        default: 9,
        min: 5,
        max: 15,
        description: 'MACD signal period',
      },
      trendPeriod: {
        type: 'number',
        default: 20,
        min: 10,
        max: 50,
        description: 'Trend SMA period',
      },
      momentumThreshold: {
        type: 'number',
        default: 0.05,
        min: 0.01,
        max: 0.2,
        description: 'Minimum price change for momentum signal',
      },
      volumeMultiplier: {
        type: 'number',
        default: 1.5,
        min: 1,
        max: 3,
        description: 'Volume confirmation multiplier',
      },
      maxPositionSize: {
        type: 'number',
        default: 0.15,
        min: 0.05,
        max: 0.3,
        description: 'Maximum position size as % of capital',
      },
      stopLossPercent: {
        type: 'number',
        default: 10,
        min: 5,
        max: 25,
        description: 'Stop loss percentage',
      },
      takeProfitPercent: {
        type: 'number',
        default: 25,
        min: 10,
        max: 50,
        description: 'Take profit percentage',
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
    
    // Update history
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

    // Calculate overall score (-100 to 100)
    const technicalScore = this.scoreTechnicals(technicals);
    const fundamentalScore = this.scoreFundamentals(fundamentals);
    const sentimentScore = this.scoreSentiment(sentiment);

    const score = (technicalScore * 0.5) + (fundamentalScore * 0.3) + (sentimentScore * 0.2);

    let recommendation: 'buy' | 'sell' | 'hold' | 'close' = 'hold';
    if (score > 30) recommendation = 'buy';
    else if (score < -30) recommendation = 'sell';

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
      
      if (signal) {
        signals.push(signal);
      }
    }

    return signals;
  }

  private generateSignalFromAnalysis(
    market: MarketSnapshot,
    analysis: MarketAnalysis
  ): Signal | null {
    const threshold = this.getParameter<number>('momentumThreshold');
    const primaryOutcome = market.outcomes[0];
    const priceChange = Math.abs(primaryOutcome.priceChange24h);

    // Need sufficient price movement
    if (priceChange < threshold) return null;

    // Need strong directional bias
    if (Math.abs(analysis.score) < 25) return null;

    const isBullish = analysis.score > 0;
    const stopLoss = this.getParameter<number>('stopLossPercent') / 100;
    const takeProfit = this.getParameter<number>('takeProfitPercent') / 100;

    const entryPrice = primaryOutcome.price;
    const strength = this.calculateSignalStrength(analysis);
    const confidence = Math.min(0.9, Math.abs(analysis.score) / 100 + 0.3);

    return this.createSignal(
      market.id,
      primaryOutcome.id,
      isBullish ? 'buy' : 'sell',
      strength,
      confidence,
      {
        entryPrice,
        stopLoss: isBullish ? entryPrice * (1 - stopLoss) : entryPrice * (1 + stopLoss),
        takeProfit: isBullish ? entryPrice * (1 + takeProfit) : entryPrice * (1 - takeProfit),
        reasoning: this.generateReasoning(analysis),
        indicators: {
          rsi: analysis.technicals.indicators.rsi,
          macd: analysis.technicals.indicators.macd,
          momentum: analysis.technicals.momentum,
          score: analysis.score,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    );
  }

  private calculateTechnicals(prices: number[], currentPrice: number): TechnicalAnalysis {
    const period = this.getParameter<number>('trendPeriod');
    
    // Calculate indicators
    const rsi = calculateRSI(prices, this.getParameter<number>('rsiPeriod'));
    const macd = calculateMACD(
      prices,
      this.getParameter<number>('macdFast'),
      this.getParameter<number>('macdSlow'),
      this.getParameter<number>('macdSignal')
    );
    const sma = calculateSMA(prices, period);
    const ema = calculateEMA(prices, period);

    // Determine trend
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (currentPrice > sma * 1.02) trend = 'bullish';
    else if (currentPrice < sma * 0.98) trend = 'bearish';

    // Calculate momentum
    const momentum = prices.length > 5 
      ? (currentPrice - prices[prices.length - 5]) / prices[prices.length - 5]
      : 0;

    // Calculate volatility
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const volatility = returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length)
      : 0;

    // Find support/resistance
    const support = this.findSupportLevels(prices);
    const resistance = this.findResistanceLevels(prices);

    return {
      trend,
      momentum,
      volatility,
      support,
      resistance,
      indicators: {
        rsi,
        macd: macd.macd,
        macdSignal: macd.signal,
        macdHistogram: macd.histogram,
        sma,
        ema,
      },
    };
  }

  private calculateFundamentals(market: MarketSnapshot): FundamentalAnalysis {
    const primaryOutcome = market.outcomes[0];
    const impliedProbability = primaryOutcome.price;
    
    // Estimate fair value (simplified)
    const volumeWeight = Math.min(1, market.volume24h / 10000);
    const liquidityWeight = Math.min(1, market.liquidity / 5000);
    const estimatedFairValue = impliedProbability * (0.5 + volumeWeight * 0.25 + liquidityWeight * 0.25);

    const mispricing = estimatedFairValue - impliedProbability;
    const timeToResolution = (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    return {
      impliedProbability,
      estimatedFairValue,
      mispricing,
      volume: market.volume24h,
      liquidity: market.liquidity,
      timeToResolution,
    };
  }

  private calculateSentiment(prices: number[], volumes: number[]): SentimentAnalysis {
    // Price trend analysis
    const recentPrices = prices.slice(-10);
    const avgRecent = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const avgOlder = prices.slice(-20, -10).reduce((a, b) => a + b, 0) / 10 || avgRecent;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (avgRecent > avgOlder * 1.02) trend = 'improving';
    else if (avgRecent < avgOlder * 0.98) trend = 'declining';

    // Volume trend
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    let volumeTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentVolume > avgVolume * 1.2) volumeTrend = 'increasing';
    else if (recentVolume < avgVolume * 0.8) volumeTrend = 'decreasing';

    // Price action (accumulation/distribution)
    let priceAction: 'accumulation' | 'distribution' | 'neutral' = 'neutral';
    if (trend === 'improving' && volumeTrend === 'increasing') priceAction = 'accumulation';
    else if (trend === 'declining' && volumeTrend === 'increasing') priceAction = 'distribution';

    // Sentiment score (-100 to 100)
    let score = 0;
    if (trend === 'improving') score += 30;
    else if (trend === 'declining') score -= 30;
    if (priceAction === 'accumulation') score += 20;
    else if (priceAction === 'distribution') score -= 20;

    return { score, trend, volumeTrend, priceAction };
  }

  private scoreTechnicals(technicals: TechnicalAnalysis): number {
    let score = 0;
    const rsiOverbought = this.getParameter<number>('rsiOverbought');
    const rsiOversold = this.getParameter<number>('rsiOversold');

    // Trend
    if (technicals.trend === 'bullish') score += 25;
    else if (technicals.trend === 'bearish') score -= 25;

    // RSI
    const rsi = technicals.indicators.rsi;
    if (rsi < rsiOversold) score += 20; // Oversold, potential buy
    else if (rsi > rsiOverbought) score -= 20; // Overbought, potential sell
    else if (rsi > 50) score += 10;
    else score -= 10;

    // MACD
    if (technicals.indicators.macdHistogram > 0) score += 15;
    else score -= 15;

    // Momentum
    score += technicals.momentum * 100;

    return Math.max(-100, Math.min(100, score));
  }

  private scoreFundamentals(fundamentals: FundamentalAnalysis): number {
    let score = 0;

    // Mispricing (positive = undervalued)
    score += fundamentals.mispricing * 200;

    // Volume confidence
    if (fundamentals.volume > 5000) score += 15;
    else if (fundamentals.volume < 1000) score -= 10;

    // Liquidity confidence
    if (fundamentals.liquidity > 3000) score += 10;
    else if (fundamentals.liquidity < 500) score -= 15;

    // Time decay factor
    if (fundamentals.timeToResolution < 7) score *= 0.5; // Less confident near resolution

    return Math.max(-100, Math.min(100, score));
  }

  private scoreSentiment(sentiment: SentimentAnalysis): number {
    return sentiment.score;
  }

  private calculateSignalStrength(analysis: MarketAnalysis): 1 | 2 | 3 | 4 | 5 {
    const absScore = Math.abs(analysis.score);
    if (absScore >= 75) return 5;
    if (absScore >= 60) return 4;
    if (absScore >= 45) return 3;
    if (absScore >= 30) return 2;
    return 1;
  }

  private generateReasoning(analysis: MarketAnalysis): string {
    const parts: string[] = [];

    parts.push(`Trend: ${analysis.technicals.trend}`);
    parts.push(`RSI: ${analysis.technicals.indicators.rsi.toFixed(1)}`);
    parts.push(`Momentum: ${(analysis.technicals.momentum * 100).toFixed(2)}%`);
    
    if (analysis.fundamentals.mispricing > 0.05) {
      parts.push('Potentially undervalued');
    } else if (analysis.fundamentals.mispricing < -0.05) {
      parts.push('Potentially overvalued');
    }

    parts.push(`Sentiment: ${analysis.sentiment.trend}`);
    parts.push(`Score: ${analysis.score.toFixed(1)}`);

    return parts.join(' | ');
  }

  private findSupportLevels(prices: number[]): number[] {
    const levels: number[] = [];
    const threshold = 0.02;

    for (let i = 2; i < prices.length - 2; i++) {
      if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1] &&
          prices[i] < prices[i - 2] && prices[i] < prices[i + 2]) {
        const exists = levels.some(l => Math.abs(l - prices[i]) < threshold);
        if (!exists) levels.push(prices[i]);
      }
    }

    return levels.slice(-3);
  }

  private findResistanceLevels(prices: number[]): number[] {
    const levels: number[] = [];
    const threshold = 0.02;

    for (let i = 2; i < prices.length - 2; i++) {
      if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1] &&
          prices[i] > prices[i - 2] && prices[i] > prices[i + 2]) {
        const exists = levels.some(l => Math.abs(l - prices[i]) < threshold);
        if (!exists) levels.push(prices[i]);
      }
    }

    return levels.slice(-3);
  }

  protected async onValidateSignal(signal: Signal): Promise<boolean> {
    // Additional momentum-specific validation
    const rsi = signal.indicators.rsi;
    const rsiOverbought = this.getParameter<number>('rsiOverbought');
    const rsiOversold = this.getParameter<number>('rsiOversold');

    // Don't buy into extreme overbought
    if (signal.type === 'buy' && rsi > rsiOverbought + 10) return false;
    // Don't sell into extreme oversold
    if (signal.type === 'sell' && rsi < rsiOversold - 10) return false;

    return true;
  }

  protected onSignalResult(_signal: Signal, _result: SignalResult): void {
    // Could implement adaptive parameter tuning here
  }

  protected calculateCurrentExposure(): number {
    return this.activePositions * 0.1; // Simplified
  }
}

// Export singleton instance
export const momentumStrategy = new MomentumStrategy();
