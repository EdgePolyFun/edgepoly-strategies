# EdgePoly Strategiesd

<p align="center">
  <strong>Production-Ready Trading Strategies for EdgePoly</strong>
</p>

<p align="center">
  <a href="https://github.com/EdgePolyFun/edgepoly-strategies/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" /></a>
  <a href="https://docs.edgepoly.fun/strategies"><img src="https://img.shields.io/badge/docs-edgepoly.fun-blue.svg" alt="documentation" /></a>
</p>

---

## Overview

EdgePoly Strategies is a comprehensive collection of battle-tested trading strategies for prediction markets. Each strategy is designed to be:

- **Production-Ready** - Fully tested with comprehensive backtesting support
- **Configurable** - Extensive parameters for customization
- **Type-Safe** - Full TypeScript support with detailed types
- **Documented** - Clear documentation with examples

---

## Available Strategies

### 1. Momentum Trend Follower

**Category:** Momentum | **Risk:** Medium | **Time Horizon:** Swing

Identifies and follows strong price trends using technical analysis.

```typescript
import { MomentumStrategy } from '@edgepoly/strategies';

const momentum = new MomentumStrategy();
await momentum.initialize({
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  momentumThreshold: 0.05,
  maxPositionSize: 0.15,
});

const signals = await momentum.generateSignals(markets);
```

**Key Features:**
- RSI-based overbought/oversold detection
- MACD momentum confirmation
- Trend strength analysis with support/resistance levels
- Dynamic position sizing with Kelly criterion

---

### 2. Mean Reversion Contrarian

**Category:** Mean Reversion | **Risk:** Medium | **Time Horizon:** Intraday

Capitalizes on price deviations from historical averages.

```typescript
import { MeanReversionStrategy } from '@edgepoly/strategies';

const meanReversion = new MeanReversionStrategy();
await meanReversion.initialize({
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  zScoreThreshold: 2,
  targetReversion: 0.5,
});

const signals = await meanReversion.generateSignals(markets);
```

**Key Features:**
- Bollinger Band analysis
- Z-Score extreme detection
- ATR-based dynamic stops
- Volume spike confirmation

---

### 3. Narrative Cascade

**Category:** Narrative/Event-Driven | **Risk:** High | **Time Horizon:** Swing

Exploits correlated markets based on narrative connections.

```typescript
import { NarrativeCascadeStrategy } from '@edgepoly/strategies';

const cascade = new NarrativeCascadeStrategy();
await cascade.initialize({
  minCorrelation: 0.6,
  cascadeDelay: 2,
  maxCascadeDepth: 3,
  diversificationTargets: 5,
});

// Define narrative links
cascade.defineNarrativeLinks([
  {
    sourceMarket: 'election-market-id',
    targetMarket: 'policy-market-id',
    correlation: 'positive',
    strength: 0.8,
    lag: 2,
    weight: 0.4,
    reasoning: 'Policy outcomes correlated with election results',
  },
]);

const signals = await cascade.generateSignals(markets);
```

**Key Features:**
- Cross-market correlation analysis
- Delayed cascade execution
- Multi-market diversification
- Automatic narrative link discovery

---

### 4. Smart DCA (Dollar Cost Averaging)

**Category:** Portfolio | **Risk:** Low | **Time Horizon:** Long-term

Intelligent DCA with dynamic allocation based on market conditions.

```typescript
import { SmartDCAStrategy } from '@edgepoly/strategies';

const dca = new SmartDCAStrategy();
await dca.initialize({
  baseInterval: 24, // hours
  baseAmount: 50,
  minMultiplier: 0.5,
  maxMultiplier: 2,
  valueAveragingEnabled: true,
});

// Add markets to schedule
dca.addToSchedule('market-id', 'yes', {
  intervalHours: 24,
  baseAmount: 50,
  startNow: true,
});

const signals = await dca.generateSignals(markets);
```

**Key Features:**
- Dynamic purchase amounts based on price
- RSI-adjusted buying
- Value averaging option
- Automatic schedule management

---

### 5. Volatility Breakout

**Category:** Momentum | **Risk:** High | **Time Horizon:** Intraday

Captures explosive moves when markets break out of consolidation.

```typescript
import { VolatilityBreakoutStrategy } from '@edgepoly/strategies';

const breakout = new VolatilityBreakoutStrategy();
await breakout.initialize({
  compressionPeriod: 20,
  compressionThreshold: 0.5,
  breakoutMultiplier: 1.5,
  volumeConfirmation: true,
  trailingStop: true,
});

const signals = await breakout.generateSignals(markets);
```

**Key Features:**
- Bollinger Band squeeze detection
- Channel breakout confirmation
- Volume expansion validation
- Trailing stop support

---

## Backtesting

Test strategies with historical data:

```typescript
import { BacktestEngine, MomentumStrategy } from '@edgepoly/strategies';

const engine = new BacktestEngine(dataProvider, {
  slippage: 0.005,
  fees: 0.02,
});

const result = await engine.run(new MomentumStrategy(), {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  initialCapital: 10000,
  parameters: { rsiPeriod: 14 },
  markets: ['market-1', 'market-2'],
  maxConcurrentPositions: 5,
});

console.log('Backtest Results:');
console.log(`  Total Return: ${(result.summary.totalReturn * 100).toFixed(2)}%`);
console.log(`  Win Rate: ${(result.summary.winRate * 100).toFixed(1)}%`);
console.log(`  Sharpe Ratio: ${result.summary.sharpeRatio.toFixed(2)}`);
console.log(`  Max Drawdown: ${(result.summary.maxDrawdown * 100).toFixed(1)}%`);
```

### Backtest Metrics

| Metric | Description |
|--------|-------------|
| Total Return | Overall strategy return |
| Win Rate | Percentage of winning trades |
| Sharpe Ratio | Risk-adjusted return |
| Sortino Ratio | Downside risk-adjusted return |
| Calmar Ratio | Return vs max drawdown |
| Profit Factor | Gross profit / gross loss |
| Max Drawdown | Largest peak-to-trough decline |
| Expectancy | Average expected return per trade |

---

## Signal Aggregation

Combine signals from multiple strategies:

```typescript
import { 
  SignalAggregator, 
  MomentumStrategy, 
  MeanReversionStrategy 
} from '@edgepoly/strategies';

const aggregator = new SignalAggregator({
  minConsensus: 0.6,
  weightByPerformance: true,
});

aggregator.addStrategy(new MomentumStrategy(), 1.2);
aggregator.addStrategy(new MeanReversionStrategy(), 1.0);

const aggregatedSignals = await aggregator.generateSignals(markets);

// Each signal includes consensus score
aggregatedSignals.forEach(signal => {
  console.log(`${signal.type} ${signal.marketId}`);
  console.log(`  Consensus: ${(signal.consensus * 100).toFixed(0)}%`);
  console.log(`  Sources: ${signal.sourceStrategies.join(', ')}`);
});
```

---

## Technical Indicators

Full library of technical analysis tools:

```typescript
import {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateSMA,
  calculateEMA,
  calculateZScore,
} from '@edgepoly/strategies';

// RSI
const rsi = calculateRSI(prices, 14);

// MACD
const { macd, signal, histogram } = calculateMACD(prices, 12, 26, 9);

// Bollinger Bands
const { upper, middle, lower } = calculateBollingerBands(prices, 20, 2);

// ATR
const atr = calculateATR(prices, 14);
```

### Available Indicators

**Moving Averages:**
- SMA (Simple Moving Average)
- EMA (Exponential Moving Average)
- WMA (Weighted Moving Average)

**Momentum:**
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Stochastic Oscillator
- ROC (Rate of Change)
- Williams %R

**Volatility:**
- Bollinger Bands
- ATR (Average True Range)
- Standard Deviation
- Z-Score

**Channels:**
- Donchian Channel (High/Low)
- Keltner Channel

**Volume:**
- VWAP
- OBV Trend

**Trend:**
- ADX (Average Directional Index)
- Trend Strength

---

## Strategy Configuration

Each strategy has extensive configurable parameters:

```typescript
const strategy = new MomentumStrategy();

// Access default config
console.log(strategy.config);
// {
//   id: 'momentum-v1',
//   name: 'Momentum Trend Follower',
//   category: 'momentum',
//   riskLevel: 'medium',
//   timeHorizon: 'swing',
//   minCapital: 100,
//   expectedReturn: { annual: 45, monthly: 3.75 },
//   maxDrawdown: 20,
//   winRate: 55,
//   parameters: { ... }
// }

// Initialize with custom parameters
await strategy.initialize({
  rsiPeriod: 10,        // Faster RSI
  momentumThreshold: 0.03,  // More sensitive
  maxPositionSize: 0.2,     // Larger positions
});
```

---

## Creating Custom Strategies

Extend the base class to create your own:

```typescript
import { BaseStrategy, type StrategyConfig, type Signal } from '@edgepoly/strategies';

class MyCustomStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: 'my-custom-v1',
    name: 'My Custom Strategy',
    category: 'momentum',
    riskLevel: 'medium',
    timeHorizon: 'swing',
    minCapital: 100,
    expectedReturn: { annual: 40, monthly: 3.3 },
    maxDrawdown: 20,
    winRate: 55,
    parameters: {
      myParam: {
        type: 'number',
        default: 10,
        min: 1,
        max: 100,
        description: 'My custom parameter',
      },
    },
  };

  protected async onInitialize(): Promise<void> {
    // Custom initialization logic
  }

  async analyze(market: MarketSnapshot): Promise<MarketAnalysis> {
    // Your analysis logic
  }

  async generateSignals(markets: MarketSnapshot[]): Promise<Signal[]> {
    // Your signal generation logic
  }

  protected async onValidateSignal(signal: Signal): Promise<boolean> {
    // Custom validation
    return true;
  }

  protected onSignalResult(signal: Signal, result: SignalResult): void {
    // Handle signal outcome
  }

  protected calculateCurrentExposure(): number {
    return this.activePositions * 0.1;
  }
}
```

---

## Performance Utilities

Helpful functions for performance analysis:

```typescript
import { 
  sharpeRatio, 
  sortinoRatio, 
  maxDrawdown, 
  cagr 
} from '@edgepoly/strategies';

// Calculate Sharpe Ratio
const sharpe = sharpeRatio(returns, riskFreeRate);

// Calculate Sortino Ratio (downside only)
const sortino = sortinoRatio(returns, riskFreeRate);

// Calculate Maximum Drawdown
const { value, percent } = maxDrawdown(equityCurve);

// Calculate CAGR
const compoundReturn = cagr(startValue, endValue, years);
```

---

## Strategy Registry

Quickly access all available strategies:

```typescript
import { 
  StrategyRegistry, 
  getStrategy, 
  getAllStrategies, 
  getStrategiesByCategory 
} from '@edgepoly/strategies';

// Access by name
const momentum = StrategyRegistry.momentum;

// Get by ID
const strategy = getStrategy('momentum-v1');

// Get all strategies
const all = getAllStrategies();

// Filter by category
const momentumStrategies = getStrategiesByCategory('momentum');
```

---

## TypeScript Support

Full type definitions included:

```typescript
import type {
  IStrategy,
  StrategyConfig,
  Signal,
  SignalType,
  MarketSnapshot,
  MarketAnalysis,
  BacktestConfig,
  BacktestResult,
  PerformanceMetrics,
} from '@edgepoly/strategies';
```

---

## Installation

```bash
npm install @edgepoly/strategies
# or
yarn add @edgepoly/strategies
# or
pnpm add @edgepoly/strategies
```

**Peer Dependencies:**
```bash
npm install @edgepoly/sdk
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

1. Fork the repository
2. Create a feature branch
3. Add your strategy or improvement
4. Include tests and documentation
5. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- [Documentation](https://docs.edgepoly.fun)
- [GitHub](https://github.com/EdgePolyFun/edgepoly-strategies)
- [Twitter](https://twitter.com/edgepolyfun)

---

<p align="center">
  Built with care by the <a href="https://edgepoly.fun">EdgePoly</a> team
</p>
