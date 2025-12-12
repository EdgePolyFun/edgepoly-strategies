/**
 * EdgePoly Strategies - Type Definitions
 */

// ============================================================================
// Base Types
// ============================================================================

export type MarketId = string;
export type StrategyId = string;

export type StrategyCategory = 
  | 'momentum'
  | 'mean_reversion'
  | 'arbitrage'
  | 'event_driven'
  | 'market_making'
  | 'portfolio'
  | 'hedging'
  | 'narrative';

export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high';

export type TimeHorizon = 'scalp' | 'intraday' | 'swing' | 'position' | 'long_term';

// ============================================================================
// Strategy Configuration
// ============================================================================

export interface StrategyConfig {
  id: StrategyId;
  name: string;
  description: string;
  category: StrategyCategory;
  riskLevel: RiskLevel;
  timeHorizon: TimeHorizon;
  minCapital: number;
  expectedReturn: {
    annual: number;
    monthly: number;
  };
  maxDrawdown: number;
  winRate: number;
  parameters: StrategyParameters;
  metadata?: Record<string, unknown>;
}

export interface StrategyParameters {
  [key: string]: ParameterDefinition;
}

export interface ParameterDefinition {
  type: 'number' | 'boolean' | 'string' | 'select';
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description: string;
  required?: boolean;
}

// ============================================================================
// Signal Types
// ============================================================================

export type SignalType = 'buy' | 'sell' | 'hold' | 'close';
export type SignalStrength = 1 | 2 | 3 | 4 | 5;

export interface Signal {
  id: string;
  strategyId: StrategyId;
  marketId: MarketId;
  outcomeId: string;
  type: SignalType;
  strength: SignalStrength;
  confidence: number; // 0-1
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  size?: number;
  reasoning: string;
  indicators: Record<string, number>;
  timestamp: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SignalResult {
  signalId: string;
  executed: boolean;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  holdingPeriod?: number;
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
}

// ============================================================================
// Market Data Types
// ============================================================================

export interface MarketSnapshot {
  id: MarketId;
  question: string;
  outcomes: OutcomeSnapshot[];
  volume: number;
  volume24h: number;
  liquidity: number;
  resolved: boolean;
  resolutionOutcome?: string;
  endDate: Date;
  timestamp: Date;
}

export interface OutcomeSnapshot {
  id: string;
  name: string;
  price: number;
  previousPrice: number;
  priceChange24h: number;
  volume24h: number;
}

export interface PriceBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookSnapshot {
  marketId: MarketId;
  outcomeId: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  spread: number;
  midPrice: number;
  timestamp: Date;
}

// ============================================================================
// Backtest Types
// ============================================================================

export interface BacktestConfig {
  strategyId: StrategyId;
  parameters: Record<string, unknown>;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  markets?: MarketId[];
  maxConcurrentPositions?: number;
  slippage?: number;
  fees?: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  summary: BacktestSummary;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  drawdowns: DrawdownPeriod[];
  monthlyReturns: MonthlyReturn[];
  metrics: PerformanceMetrics;
}

export interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageHoldingPeriod: number;
  exposure: number;
}

export interface BacktestTrade {
  id: string;
  marketId: MarketId;
  outcomeId: string;
  side: 'buy' | 'sell';
  entryTime: Date;
  exitTime?: Date;
  entryPrice: number;
  exitPrice?: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  slippage: number;
  signal: Signal;
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

export interface DrawdownPeriod {
  startDate: Date;
  endDate: Date;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  duration: number;
  recovered: boolean;
  recoveryDate?: Date;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
  trades: number;
}

export interface PerformanceMetrics {
  cagr: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  payoffRatio: number;
  ulcerIndex: number;
  informationRatio?: number;
  beta?: number;
  alpha?: number;
}

// ============================================================================
// Portfolio Types
// ============================================================================

export interface PortfolioAllocation {
  marketId: MarketId;
  outcomeId: string;
  weight: number;
  targetPosition: number;
  currentPosition: number;
  deviation: number;
}

export interface RebalanceAction {
  marketId: MarketId;
  outcomeId: string;
  action: 'buy' | 'sell';
  amount: number;
  priority: number;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface MarketAnalysis {
  marketId: MarketId;
  timestamp: Date;
  technicals: TechnicalAnalysis;
  fundamentals: FundamentalAnalysis;
  sentiment: SentimentAnalysis;
  score: number;
  recommendation: SignalType;
}

export interface TechnicalAnalysis {
  trend: 'bullish' | 'bearish' | 'neutral';
  momentum: number;
  volatility: number;
  support: number[];
  resistance: number[];
  indicators: Record<string, number>;
}

export interface FundamentalAnalysis {
  impliedProbability: number;
  estimatedFairValue: number;
  mispricing: number;
  volume: number;
  liquidity: number;
  timeToResolution: number;
}

export interface SentimentAnalysis {
  score: number;
  trend: 'improving' | 'declining' | 'stable';
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  priceAction: 'accumulation' | 'distribution' | 'neutral';
}

// ============================================================================
// Strategy Interface
// ============================================================================

export interface IStrategy {
  readonly config: StrategyConfig;
  
  initialize(params: Record<string, unknown>): Promise<void>;
  analyze(market: MarketSnapshot): Promise<MarketAnalysis>;
  generateSignals(markets: MarketSnapshot[]): Promise<Signal[]>;
  validateSignal(signal: Signal): Promise<boolean>;
  getPositionSize(signal: Signal, capital: number): number;
  onSignalExecuted(signal: Signal, result: SignalResult): void;
  getStatus(): StrategyStatus;
  reset(): void;
}

export interface StrategyStatus {
  isActive: boolean;
  lastSignal?: Signal;
  activePositions: number;
  totalSignals: number;
  successRate: number;
  currentExposure: number;
}

// ============================================================================
// Indicator Types
// ============================================================================

export interface IndicatorConfig {
  name: string;
  parameters: Record<string, number>;
}

export interface IndicatorResult {
  name: string;
  value: number;
  signal?: SignalType;
  timestamp: Date;
}
