/**
 * EdgePoly Strategies
 * 
 * Production-ready trading strategies for EdgePoly - Chain-Reaction Automation Platform
 * 
 * @packageDocumentation
 * 
 * @example
 * ```typescript
 * import { MomentumStrategy, BacktestEngine } from '@edgepoly/strategies';
 * 
 * // Use a strategy
 * const momentum = new MomentumStrategy();
 * await momentum.initialize({
 *   rsiPeriod: 14,
 *   momentumThreshold: 0.05,
 * });
 * 
 * // Generate signals
 * const signals = await momentum.generateSignals(markets);
 * 
 * // Backtest a strategy
 * const engine = new BacktestEngine(dataProvider);
 * const result = await engine.run(momentum, {
 *   startDate: new Date('2024-01-01'),
 *   endDate: new Date('2024-12-31'),
 *   initialCapital: 10000,
 * });
 * ```
 */

// ============================================================================
// Strategy Exports
// ============================================================================

export { BaseStrategy } from './strategies/base';

export { 
  MomentumStrategy, 
  momentumStrategy 
} from './strategies/momentum';

export { 
  MeanReversionStrategy, 
  meanReversionStrategy 
} from './strategies/mean-reversion';

export { 
  NarrativeCascadeStrategy, 
  narrativeCascadeStrategy 
} from './strategies/narrative-cascade';
export type { NarrativeLink } from './strategies/narrative-cascade';

export { 
  SmartDCAStrategy, 
  smartDCAStrategy 
} from './strategies/smart-dca';
export type { DCASchedule } from './strategies/smart-dca';

export { 
  VolatilityBreakoutStrategy, 
  volatilityBreakoutStrategy 
} from './strategies/volatility-breakout';

// ============================================================================
// Backtesting Exports
// ============================================================================

export { BacktestEngine } from './backtesting/engine';
export type { MarketDataProvider } from './backtesting/engine';

// ============================================================================
// Signal Exports
// ============================================================================

export { SignalAggregator, SignalFilter } from './signals';
export type { AggregatedSignal, AggregatorConfig, FilterConfig } from './signals';

// ============================================================================
// Indicator Exports
// ============================================================================

export {
  // Moving Averages
  calculateSMA,
  calculateEMA,
  calculateWMA,
  
  // Momentum
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateROC,
  calculateWilliamsR,
  
  // Volatility
  calculateBollingerBands,
  calculateATR,
  calculateStdDev,
  calculateZScore,
  
  // Channels
  calculateHighLow,
  calculateKeltnerChannel,
  
  // Volume
  calculateVWAP,
  calculateOBVTrend,
  
  // Trend
  calculateADX,
  calculateTrendStrength,
  
  // Utility
  percentChange,
  logReturn,
  calculateReturns,
  calculateCorrelation,
} from './utils/indicators';

// ============================================================================
// Helper Exports
// ============================================================================

export {
  generateId,
  formatCurrency,
  formatPercentage,
  formatCompact,
  clamp,
  round,
  sleep,
  timeDiff,
  deepClone,
  pick,
  omit,
  groupBy,
  median,
  percentile,
  sharpeRatio,
  sortinoRatio,
  maxDrawdown,
  cagr,
} from './utils/helpers';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Base Types
  MarketId,
  StrategyId,
  StrategyCategory,
  RiskLevel,
  TimeHorizon,
  
  // Strategy Types
  StrategyConfig,
  StrategyParameters,
  ParameterDefinition,
  IStrategy,
  StrategyStatus,
  
  // Signal Types
  Signal,
  SignalType,
  SignalStrength,
  SignalResult,
  
  // Market Types
  MarketSnapshot,
  OutcomeSnapshot,
  PriceBar,
  OrderBookSnapshot,
  
  // Analysis Types
  MarketAnalysis,
  TechnicalAnalysis,
  FundamentalAnalysis,
  SentimentAnalysis,
  
  // Backtest Types
  BacktestConfig,
  BacktestResult,
  BacktestSummary,
  BacktestTrade,
  EquityPoint,
  DrawdownPeriod,
  MonthlyReturn,
  PerformanceMetrics,
  
  // Portfolio Types
  PortfolioAllocation,
  RebalanceAction,
  
  // Indicator Types
  IndicatorConfig,
  IndicatorResult,
} from './types';

// ============================================================================
// Version
// ============================================================================

export const VERSION = '1.0.0';

// ============================================================================
// Strategy Registry
// ============================================================================

import { momentumStrategy } from './strategies/momentum';
import { meanReversionStrategy } from './strategies/mean-reversion';
import { narrativeCascadeStrategy } from './strategies/narrative-cascade';
import { smartDCAStrategy } from './strategies/smart-dca';
import { volatilityBreakoutStrategy } from './strategies/volatility-breakout';

/**
 * Registry of all available strategies
 */
export const StrategyRegistry = {
  momentum: momentumStrategy,
  meanReversion: meanReversionStrategy,
  narrativeCascade: narrativeCascadeStrategy,
  smartDCA: smartDCAStrategy,
  volatilityBreakout: volatilityBreakoutStrategy,
};

/**
 * Get a strategy by ID
 */
export function getStrategy(id: string) {
  return Object.values(StrategyRegistry).find(s => s.config.id === id);
}

/**
 * Get all available strategies
 */
export function getAllStrategies() {
  return Object.values(StrategyRegistry);
}

/**
 * Get strategies by category
 */
export function getStrategiesByCategory(category: string) {
  return Object.values(StrategyRegistry).filter(
    s => s.config.category === category
  );
}

/**
 * Get strategies by risk level
 */
export function getStrategiesByRiskLevel(riskLevel: string) {
  return Object.values(StrategyRegistry).filter(
    s => s.config.riskLevel === riskLevel
  );
}
