/**
 * EdgePoly Strategies - Base Strategy Class
 * 
 * Abstract base class that all strategies extend from.
 */

import type {
  IStrategy,
  StrategyConfig,
  StrategyStatus,
  MarketSnapshot,
  MarketAnalysis,
  Signal,
  SignalResult,
  SignalType,
  SignalStrength,
} from '../types';
import { generateId } from '../utils/helpers';

export abstract class BaseStrategy implements IStrategy {
  abstract readonly config: StrategyConfig;
  
  protected parameters: Record<string, unknown> = {};
  protected isInitialized = false;
  protected signals: Signal[] = [];
  protected results: SignalResult[] = [];
  protected activePositions = 0;

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  async initialize(params: Record<string, unknown>): Promise<void> {
    // Merge with defaults
    this.parameters = {
      ...this.getDefaultParameters(),
      ...params,
    };

    // Validate parameters
    this.validateParameters();

    this.isInitialized = true;
    await this.onInitialize();
  }

  protected abstract onInitialize(): Promise<void>;

  protected getDefaultParameters(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(this.config.parameters)) {
      defaults[key] = param.default;
    }
    return defaults;
  }

  protected validateParameters(): void {
    for (const [key, param] of Object.entries(this.config.parameters)) {
      const value = this.parameters[key];
      
      if (param.required && value === undefined) {
        throw new Error(`Required parameter '${key}' is missing`);
      }

      if (value !== undefined) {
        if (param.type === 'number') {
          if (typeof value !== 'number') {
            throw new Error(`Parameter '${key}' must be a number`);
          }
          if (param.min !== undefined && value < param.min) {
            throw new Error(`Parameter '${key}' must be >= ${param.min}`);
          }
          if (param.max !== undefined && value > param.max) {
            throw new Error(`Parameter '${key}' must be <= ${param.max}`);
          }
        }

        if (param.type === 'select' && param.options) {
          if (!param.options.includes(value as string)) {
            throw new Error(`Parameter '${key}' must be one of: ${param.options.join(', ')}`);
          }
        }
      }
    }
  }

  reset(): void {
    this.signals = [];
    this.results = [];
    this.activePositions = 0;
  }

  // ============================================================================
  // Analysis Methods
  // ============================================================================

  abstract analyze(market: MarketSnapshot): Promise<MarketAnalysis>;

  abstract generateSignals(markets: MarketSnapshot[]): Promise<Signal[]>;

  async validateSignal(signal: Signal): Promise<boolean> {
    // Basic validation
    if (signal.confidence < 0.3) return false;
    if (signal.strength < 2) return false;
    
    // Check if expired
    if (signal.expiresAt && new Date() > signal.expiresAt) return false;

    // Strategy-specific validation
    return this.onValidateSignal(signal);
  }

  protected abstract onValidateSignal(signal: Signal): Promise<boolean>;

  // ============================================================================
  // Position Sizing
  // ============================================================================

  getPositionSize(signal: Signal, capital: number): number {
    // Base position size using Kelly Criterion
    const kellyFraction = this.calculateKellyFraction(signal);
    
    // Apply fractional Kelly (safer)
    const adjustedKelly = kellyFraction * 0.25;
    
    // Apply confidence scaling
    const confidenceMultiplier = signal.confidence;
    
    // Apply strength scaling
    const strengthMultiplier = signal.strength / 5;
    
    // Calculate base size
    let size = capital * adjustedKelly * confidenceMultiplier * strengthMultiplier;
    
    // Apply limits
    const maxSize = capital * (this.parameters.maxPositionSize as number || 0.1);
    const minSize = this.config.minCapital * 0.01;
    
    size = Math.min(size, maxSize);
    size = Math.max(size, minSize);
    
    return Math.round(size * 100) / 100;
  }

  protected calculateKellyFraction(signal: Signal): number {
    const winProb = signal.confidence;
    const lossProb = 1 - winProb;
    
    // Estimate win/loss ratio from target and stop loss
    const entryPrice = signal.entryPrice || 0.5;
    const targetPrice = signal.targetPrice || entryPrice + 0.1;
    const stopLoss = signal.stopLoss || entryPrice - 0.1;
    
    const potentialWin = Math.abs(targetPrice - entryPrice);
    const potentialLoss = Math.abs(entryPrice - stopLoss);
    
    if (potentialLoss === 0) return 0;
    
    const winLossRatio = potentialWin / potentialLoss;
    
    // Kelly formula: (bp - q) / b
    const kelly = (winLossRatio * winProb - lossProb) / winLossRatio;
    
    return Math.max(0, kelly);
  }

  // ============================================================================
  // Signal Management
  // ============================================================================

  onSignalExecuted(signal: Signal, result: SignalResult): void {
    this.results.push(result);
    
    if (result.executed) {
      if (result.outcome === 'pending') {
        this.activePositions++;
      } else {
        this.activePositions = Math.max(0, this.activePositions - 1);
      }
    }

    this.onSignalResult(signal, result);
  }

  protected abstract onSignalResult(signal: Signal, result: SignalResult): void;

  // ============================================================================
  // Status
  // ============================================================================

  getStatus(): StrategyStatus {
    const winningResults = this.results.filter(r => r.outcome === 'win').length;
    const completedResults = this.results.filter(r => r.outcome !== 'pending').length;
    
    return {
      isActive: this.isInitialized,
      lastSignal: this.signals[this.signals.length - 1],
      activePositions: this.activePositions,
      totalSignals: this.signals.length,
      successRate: completedResults > 0 ? winningResults / completedResults : 0,
      currentExposure: this.calculateCurrentExposure(),
    };
  }

  protected abstract calculateCurrentExposure(): number;

  // ============================================================================
  // Helper Methods
  // ============================================================================

  protected createSignal(
    marketId: string,
    outcomeId: string,
    type: SignalType,
    strength: SignalStrength,
    confidence: number,
    options: Partial<Signal> = {}
  ): Signal {
    const signal: Signal = {
      id: generateId(),
      strategyId: this.config.id,
      marketId,
      outcomeId,
      type,
      strength,
      confidence,
      reasoning: options.reasoning || '',
      indicators: options.indicators || {},
      timestamp: new Date(),
      ...options,
    };

    this.signals.push(signal);
    return signal;
  }

  protected getParameter<T>(key: string): T {
    return this.parameters[key] as T;
  }
}
