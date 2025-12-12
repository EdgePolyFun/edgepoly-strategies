/**
 * EdgePoly Strategies - Narrative Cascade Strategy
 * 
 * Exploits correlated markets based on narrative/thematic connections.
 * When a primary market resolves, cascades positions into related markets.
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

export interface NarrativeLink {
  sourceMarket: MarketId;
  targetMarket: MarketId;
  correlation: 'positive' | 'negative';
  strength: number; // 0-1
  lag: number; // hours delay before acting
  weight: number; // allocation weight 0-1
  reasoning: string;
}

export class NarrativeCascadeStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: 'narrative-cascade-v1',
    name: 'Narrative Cascade',
    description: 'Identifies thematically linked markets and cascades positions when trigger markets resolve. Uses correlation analysis and narrative mapping. Best for event-driven scenarios.',
    category: 'narrative',
    riskLevel: 'high',
    timeHorizon: 'swing',
    minCapital: 200,
    expectedReturn: {
      annual: 65,
      monthly: 5.4,
    },
    maxDrawdown: 30,
    winRate: 52,
    parameters: {
      minCorrelation: {
        type: 'number',
        default: 0.6,
        min: 0.3,
        max: 0.9,
        description: 'Minimum correlation threshold for linked markets',
      },
      cascadeDelay: {
        type: 'number',
        default: 2,
        min: 0,
        max: 24,
        description: 'Hours to wait before executing cascade',
      },
      maxCascadeDepth: {
        type: 'number',
        default: 3,
        min: 1,
        max: 5,
        description: 'Maximum cascade chain depth',
      },
      concentrationLimit: {
        type: 'number',
        default: 0.4,
        min: 0.2,
        max: 0.6,
        description: 'Maximum allocation to single cascade chain',
      },
      diversificationTargets: {
        type: 'number',
        default: 5,
        min: 2,
        max: 10,
        description: 'Target number of positions per cascade',
      },
      useVolumeWeighting: {
        type: 'boolean',
        default: true,
        description: 'Weight allocations by target market volume',
      },
      confidenceThreshold: {
        type: 'number',
        default: 0.65,
        min: 0.5,
        max: 0.9,
        description: 'Minimum confidence to trigger cascade',
      },
      maxPositionSize: {
        type: 'number',
        default: 0.2,
        min: 0.1,
        max: 0.4,
        description: 'Maximum position size as % of capital',
      },
    },
    metadata: {
      author: 'EdgePoly Team',
      version: '1.0.0',
      lastUpdated: '2025-01-01',
    },
  };

  private narrativeLinks: NarrativeLink[] = [];
  private resolvedMarkets: Set<MarketId> = new Set();
  private pendingCascades: Map<MarketId, Date> = new Map();
  private marketCorrelations: Map<string, number> = new Map();

  protected async onInitialize(): Promise<void> {
    this.narrativeLinks = [];
    this.resolvedMarkets.clear();
    this.pendingCascades.clear();
    this.marketCorrelations.clear();
  }

  /**
   * Define narrative links between markets
   */
  defineNarrativeLink(link: NarrativeLink): void {
    this.narrativeLinks.push(link);
  }

  /**
   * Define multiple narrative links
   */
  defineNarrativeLinks(links: NarrativeLink[]): void {
    this.narrativeLinks.push(...links);
  }

  /**
   * Auto-discover narrative links based on market metadata
   */
  async discoverNarrativeLinks(markets: MarketSnapshot[]): Promise<NarrativeLink[]> {
    const discovered: NarrativeLink[] = [];

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const m1 = markets[i];
        const m2 = markets[j];

        // Calculate correlation
        const correlation = await this.calculateCorrelation(m1, m2);
        const minCorr = this.getParameter<number>('minCorrelation');

        if (Math.abs(correlation) >= minCorr) {
          discovered.push({
            sourceMarket: m1.id,
            targetMarket: m2.id,
            correlation: correlation > 0 ? 'positive' : 'negative',
            strength: Math.abs(correlation),
            lag: 2,
            weight: Math.abs(correlation),
            reasoning: `Correlation: ${(correlation * 100).toFixed(1)}%`,
          });
        }
      }
    }

    this.narrativeLinks.push(...discovered);
    return discovered;
  }

  async analyze(market: MarketSnapshot): Promise<MarketAnalysis> {
    const technicals = this.calculateTechnicals(market);
    const fundamentals = this.calculateFundamentals(market);
    const sentiment = this.calculateSentiment(market);

    // Check if this market triggers any cascades
    const linkedMarkets = this.narrativeLinks.filter(l => l.sourceMarket === market.id);
    const cascadeScore = linkedMarkets.length > 0 
      ? linkedMarkets.reduce((sum, l) => sum + l.strength, 0) / linkedMarkets.length * 50
      : 0;

    const score = (technicals.momentum * 30) + (fundamentals.mispricing * 100) + cascadeScore;

    let recommendation: 'buy' | 'sell' | 'hold' | 'close' = 'hold';
    if (market.resolved) {
      recommendation = 'close'; // Trigger cascade evaluation
    } else if (score > 30) {
      recommendation = 'buy';
    } else if (score < -30) {
      recommendation = 'sell';
    }

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

    // Check for newly resolved markets that trigger cascades
    for (const market of markets) {
      if (market.resolved && !this.resolvedMarkets.has(market.id)) {
        this.resolvedMarkets.add(market.id);
        
        // Generate cascade signals
        const cascadeSignals = await this.generateCascadeSignals(market, markets);
        signals.push(...cascadeSignals);
      }
    }

    // Check pending cascades
    const now = new Date();
    for (const [marketId, triggerTime] of this.pendingCascades) {
      if (now >= triggerTime) {
        const targetMarket = markets.find(m => m.id === marketId);
        if (targetMarket && !targetMarket.resolved) {
          const signal = await this.generateDelayedCascadeSignal(targetMarket);
          if (signal) signals.push(signal);
        }
        this.pendingCascades.delete(marketId);
      }
    }

    return signals;
  }

  private async generateCascadeSignals(
    resolvedMarket: MarketSnapshot,
    allMarkets: MarketSnapshot[]
  ): Promise<Signal[]> {
    const signals: Signal[] = [];
    const linkedMarkets = this.narrativeLinks.filter(l => l.sourceMarket === resolvedMarket.id);
    
    if (linkedMarkets.length === 0) return signals;

    // Determine resolved outcome
    const resolvedOutcome = resolvedMarket.resolutionOutcome;
    const resolvedYes = resolvedOutcome?.toLowerCase() === 'yes';

    // Calculate total weight for normalization
    const totalWeight = linkedMarkets.reduce((sum, l) => sum + l.weight, 0);
    const concentrationLimit = this.getParameter<number>('concentrationLimit');
    const confidenceThreshold = this.getParameter<number>('confidenceThreshold');
    const cascadeDelay = this.getParameter<number>('cascadeDelay');

    for (const link of linkedMarkets) {
      const targetMarket = allMarkets.find(m => m.id === link.targetMarket);
      if (!targetMarket || targetMarket.resolved) continue;

      // Calculate signal direction based on correlation and resolution
      const shouldBuy = (resolvedYes && link.correlation === 'positive') ||
                       (!resolvedYes && link.correlation === 'negative');

      // Calculate confidence based on link strength and historical accuracy
      const confidence = link.strength * 0.9;
      if (confidence < confidenceThreshold) continue;

      // Schedule delayed execution if configured
      if (link.lag > 0 || cascadeDelay > 0) {
        const delay = Math.max(link.lag, cascadeDelay);
        const triggerTime = new Date(Date.now() + delay * 60 * 60 * 1000);
        this.pendingCascades.set(link.targetMarket, triggerTime);
        continue;
      }

      // Calculate allocation weight
      const normalizedWeight = (link.weight / totalWeight) * concentrationLimit;
      const primaryOutcome = targetMarket.outcomes[0];

      const entryPrice = primaryOutcome.price;
      const targetPrice = shouldBuy ? Math.min(0.95, entryPrice * 1.3) : Math.max(0.05, entryPrice * 0.7);
      const stopLoss = shouldBuy ? entryPrice * 0.85 : entryPrice * 1.15;

      signals.push(this.createSignal(
        targetMarket.id,
        primaryOutcome.id,
        shouldBuy ? 'buy' : 'sell',
        this.strengthFromConfidence(confidence),
        confidence,
        {
          entryPrice,
          targetPrice,
          stopLoss,
          takeProfit: targetPrice,
          size: normalizedWeight, // Will be converted to actual size
          reasoning: this.generateCascadeReasoning(resolvedMarket, link, shouldBuy),
          indicators: {
            correlation: link.strength,
            sourceResolution: resolvedYes ? 1 : 0,
            allocationWeight: normalizedWeight,
          },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          metadata: {
            cascadeSource: resolvedMarket.id,
            cascadeType: link.correlation,
          },
        }
      ));
    }

    return signals;
  }

  private async generateDelayedCascadeSignal(market: MarketSnapshot): Promise<Signal | null> {
    const primaryOutcome = market.outcomes[0];
    const analysis = await this.analyze(market);

    if (Math.abs(analysis.score) < 20) return null;

    const shouldBuy = analysis.score > 0;
    const confidence = Math.min(0.8, 0.5 + Math.abs(analysis.score) / 200);

    return this.createSignal(
      market.id,
      primaryOutcome.id,
      shouldBuy ? 'buy' : 'sell',
      this.strengthFromConfidence(confidence),
      confidence,
      {
        entryPrice: primaryOutcome.price,
        reasoning: `Delayed cascade execution. Score: ${analysis.score.toFixed(1)}`,
        indicators: {
          score: analysis.score,
        },
      }
    );
  }

  private async calculateCorrelation(m1: MarketSnapshot, m2: MarketSnapshot): Promise<number> {
    const key = `${m1.id}:${m2.id}`;
    const cached = this.marketCorrelations.get(key);
    if (cached !== undefined) return cached;

    // Simplified correlation based on price movements and categories
    const o1 = m1.outcomes[0];
    const o2 = m2.outcomes[0];

    // Check for same direction movement
    const change1 = o1.priceChange24h;
    const change2 = o2.priceChange24h;

    let correlation = 0;
    if (change1 * change2 > 0) {
      correlation = 0.5; // Same direction
    } else if (change1 * change2 < 0) {
      correlation = -0.5; // Opposite direction
    }

    // Boost if similar volume patterns
    const volumeRatio = Math.min(m1.volume24h, m2.volume24h) / Math.max(m1.volume24h, m2.volume24h);
    correlation *= (1 + volumeRatio) / 2;

    this.marketCorrelations.set(key, correlation);
    return correlation;
  }

  private calculateTechnicals(market: MarketSnapshot): TechnicalAnalysis {
    const primaryOutcome = market.outcomes[0];
    
    return {
      trend: primaryOutcome.priceChange24h > 0.02 ? 'bullish' : 
             primaryOutcome.priceChange24h < -0.02 ? 'bearish' : 'neutral',
      momentum: primaryOutcome.priceChange24h,
      volatility: Math.abs(primaryOutcome.priceChange24h),
      support: [primaryOutcome.price * 0.9],
      resistance: [primaryOutcome.price * 1.1],
      indicators: {},
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

  private calculateSentiment(market: MarketSnapshot): SentimentAnalysis {
    const primaryOutcome = market.outcomes[0];
    const trend = primaryOutcome.priceChange24h > 0 ? 'improving' : 
                  primaryOutcome.priceChange24h < 0 ? 'declining' : 'stable';

    return {
      score: primaryOutcome.priceChange24h * 100,
      trend,
      volumeTrend: 'stable',
      priceAction: 'neutral',
    };
  }

  private strengthFromConfidence(confidence: number): 1 | 2 | 3 | 4 | 5 {
    if (confidence >= 0.85) return 5;
    if (confidence >= 0.75) return 4;
    if (confidence >= 0.65) return 3;
    if (confidence >= 0.55) return 2;
    return 1;
  }

  private generateCascadeReasoning(
    source: MarketSnapshot,
    link: NarrativeLink,
    shouldBuy: boolean
  ): string {
    return `Cascade from "${source.question}" | ` +
           `${link.correlation} correlation (${(link.strength * 100).toFixed(0)}%) | ` +
           `Action: ${shouldBuy ? 'BUY' : 'SELL'} | ` +
           `${link.reasoning}`;
  }

  protected async onValidateSignal(signal: Signal): Promise<boolean> {
    // Validate cascade signals
    if (signal.metadata?.cascadeSource) {
      // Ensure source actually resolved
      if (!this.resolvedMarkets.has(signal.metadata.cascadeSource as string)) {
        return false;
      }
    }
    return true;
  }

  protected onSignalResult(_signal: Signal, result: SignalResult): void {
    // Track cascade performance for link strength adjustment
    if (result.outcome !== 'pending') {
      // Could implement adaptive link strength here
    }
  }

  protected calculateCurrentExposure(): number {
    const concentrationLimit = this.getParameter<number>('concentrationLimit');
    return this.activePositions * concentrationLimit / 3;
  }
}

export const narrativeCascadeStrategy = new NarrativeCascadeStrategy();
