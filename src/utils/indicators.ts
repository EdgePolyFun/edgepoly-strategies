/**
 * EdgePoly Strategies - Technical Indicators
 * 
 * Collection of technical analysis indicators for prediction market analysis.
 */

// ============================================================================
// Moving Averages
// ============================================================================

/**
 * Simple Moving Average
 */
export function calculateSMA(data: number[], period: number): number {
  if (data.length < period) {
    return data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
  }
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Exponential Moving Average
 */
export function calculateEMA(data: number[], period: number): number {
  if (data.length === 0) return 0;
  if (data.length < period) return calculateSMA(data, period);

  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(data.slice(0, period), period);

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Weighted Moving Average
 */
export function calculateWMA(data: number[], period: number): number {
  if (data.length < period) {
    return calculateSMA(data, data.length);
  }

  const slice = data.slice(-period);
  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < period; i++) {
    const weight = i + 1;
    weightedSum += slice[i] * weight;
    weightSum += weight;
  }

  return weightedSum / weightSum;
}

// ============================================================================
// Momentum Indicators
// ============================================================================

/**
 * Relative Strength Index (RSI)
 */
export function calculateRSI(data: number[], period: number = 14): number {
  if (data.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate smoothed RSI
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (data.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  const macd = fastEMA - slowEMA;

  // Calculate signal line (EMA of MACD values)
  // Simplified: use current MACD value
  const macdHistory: number[] = [];
  for (let i = slowPeriod; i <= data.length; i++) {
    const fastE = calculateEMA(data.slice(0, i), fastPeriod);
    const slowE = calculateEMA(data.slice(0, i), slowPeriod);
    macdHistory.push(fastE - slowE);
  }

  const signal = calculateEMA(macdHistory, signalPeriod);
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

/**
 * Stochastic Oscillator
 */
export function calculateStochastic(
  data: number[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { k: number; d: number } {
  if (data.length < kPeriod) return { k: 50, d: 50 };

  // Calculate %K values
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < data.length; i++) {
    const slice = data.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    const current = data[i];

    const k = high !== low ? ((current - low) / (high - low)) * 100 : 50;
    kValues.push(k);
  }

  const k = kValues[kValues.length - 1];
  const d = calculateSMA(kValues.slice(-dPeriod), dPeriod);

  return { k, d };
}

/**
 * Rate of Change (ROC)
 */
export function calculateROC(data: number[], period: number = 10): number {
  if (data.length <= period) return 0;
  const current = data[data.length - 1];
  const previous = data[data.length - 1 - period];
  return ((current - previous) / previous) * 100;
}

/**
 * Williams %R
 */
export function calculateWilliamsR(data: number[], period: number = 14): number {
  if (data.length < period) return -50;

  const slice = data.slice(-period);
  const high = Math.max(...slice);
  const low = Math.min(...slice);
  const current = data[data.length - 1];

  if (high === low) return -50;
  return ((high - current) / (high - low)) * -100;
}

// ============================================================================
// Volatility Indicators
// ============================================================================

/**
 * Bollinger Bands
 */
export function calculateBollingerBands(
  data: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number } {
  if (data.length < period) {
    const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
    return { upper: avg, middle: avg, lower: avg };
  }

  const slice = data.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;

  // Calculate standard deviation
  const squaredDiffs = slice.map(x => Math.pow(x - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDev * stdDevMultiplier,
    middle,
    lower: middle - stdDev * stdDevMultiplier,
  };
}

/**
 * Average True Range (ATR)
 * For prediction markets, we approximate using price range
 */
export function calculateATR(data: number[], period: number = 14): number {
  if (data.length < 2) return 0;

  const trueRanges: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    // For prediction markets, TR = abs(close - previous close)
    const tr = Math.abs(data[i] - data[i - 1]);
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  // Smoothed ATR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Standard Deviation
 */
export function calculateStdDev(data: number[], period: number): number {
  if (data.length < period) return 0;

  const slice = data.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const squaredDiffs = slice.map(x => Math.pow(x - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;

  return Math.sqrt(variance);
}

/**
 * Z-Score
 */
export function calculateZScore(data: number[], period: number): number {
  if (data.length < period) return 0;

  const slice = data.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const stdDev = calculateStdDev(data, period);

  if (stdDev === 0) return 0;
  return (data[data.length - 1] - mean) / stdDev;
}

// ============================================================================
// Channel Indicators
// ============================================================================

/**
 * Donchian Channel (High/Low)
 */
export function calculateHighLow(
  data: number[],
  period: number
): { high: number; low: number; mid: number } {
  if (data.length === 0) return { high: 0, low: 0, mid: 0 };

  const slice = data.slice(-period);
  const high = Math.max(...slice);
  const low = Math.min(...slice);

  return {
    high,
    low,
    mid: (high + low) / 2,
  };
}

/**
 * Keltner Channel
 */
export function calculateKeltnerChannel(
  data: number[],
  emaPeriod: number = 20,
  atrPeriod: number = 10,
  atrMultiplier: number = 2
): { upper: number; middle: number; lower: number } {
  const middle = calculateEMA(data, emaPeriod);
  const atr = calculateATR(data, atrPeriod);

  return {
    upper: middle + atr * atrMultiplier,
    middle,
    lower: middle - atr * atrMultiplier,
  };
}

// ============================================================================
// Volume Indicators
// ============================================================================

/**
 * Volume Weighted Average Price (simplified for prediction markets)
 */
export function calculateVWAP(
  prices: number[],
  volumes: number[]
): number {
  if (prices.length === 0 || prices.length !== volumes.length) return 0;

  let totalPV = 0;
  let totalVolume = 0;

  for (let i = 0; i < prices.length; i++) {
    totalPV += prices[i] * volumes[i];
    totalVolume += volumes[i];
  }

  return totalVolume > 0 ? totalPV / totalVolume : prices[prices.length - 1];
}

/**
 * On Balance Volume (OBV) direction
 */
export function calculateOBVTrend(
  prices: number[],
  volumes: number[]
): 'bullish' | 'bearish' | 'neutral' {
  if (prices.length < 5) return 'neutral';

  let obv = 0;
  const obvValues: number[] = [0];

  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) {
      obv += volumes[i] || 1;
    } else if (prices[i] < prices[i - 1]) {
      obv -= volumes[i] || 1;
    }
    obvValues.push(obv);
  }

  // Check trend of last 5 OBV values
  const recentOBV = obvValues.slice(-5);
  const avgRecent = recentOBV.reduce((a, b) => a + b, 0) / recentOBV.length;
  const avgPrevious = obvValues.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;

  if (avgRecent > avgPrevious * 1.1) return 'bullish';
  if (avgRecent < avgPrevious * 0.9) return 'bearish';
  return 'neutral';
}

// ============================================================================
// Trend Indicators
// ============================================================================

/**
 * Average Directional Index (ADX) - simplified
 */
export function calculateADX(data: number[], period: number = 14): number {
  if (data.length < period * 2) return 25; // Neutral

  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(Math.abs(data[i] - data[i - 1]));
  }

  // Calculate directional movement
  let plusDM = 0;
  let minusDM = 0;

  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) plusDM += diff;
    else minusDM -= diff;
  }

  const atr = calculateATR(data, period);
  if (atr === 0) return 25;

  const plusDI = (plusDM / atr) * 100;
  const minusDI = (minusDM / atr) * 100;

  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

  return dx;
}

/**
 * Trend strength (0-100)
 */
export function calculateTrendStrength(data: number[], period: number = 20): number {
  if (data.length < period) return 50;

  const slice = data.slice(-period);
  const start = slice[0];
  const end = slice[slice.length - 1];
  const direction = end > start ? 1 : -1;

  // Count bars in trend direction
  let trendBars = 0;
  for (let i = 1; i < slice.length; i++) {
    if ((slice[i] - slice[i - 1]) * direction > 0) {
      trendBars++;
    }
  }

  return (trendBars / (slice.length - 1)) * 100;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate percentage change
 */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Calculate log returns
 */
export function logReturn(current: number, previous: number): number {
  if (previous <= 0 || current <= 0) return 0;
  return Math.log(current / previous);
}

/**
 * Calculate returns series
 */
export function calculateReturns(data: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < data.length; i++) {
    returns.push((data[i] - data[i - 1]) / data[i - 1]);
  }
  return returns;
}

/**
 * Calculate correlation between two series
 */
export function calculateCorrelation(series1: number[], series2: number[]): number {
  const n = Math.min(series1.length, series2.length);
  if (n < 2) return 0;

  const s1 = series1.slice(-n);
  const s2 = series2.slice(-n);

  const mean1 = s1.reduce((a, b) => a + b, 0) / n;
  const mean2 = s2.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = s1[i] - mean1;
    const diff2 = s2[i] - mean2;
    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(denom1 * denom2);
  if (denominator === 0) return 0;

  return numerator / denominator;
}
