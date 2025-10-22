import chalk from "chalk";
import Table from "cli-table3";
import dayjs from "dayjs";
import { KalshiCorrelator } from "./quickstart.js";
import { transformCandlestickData } from "./candlestick-plotter.js";
import type { Market } from "kalshi-typescript";

interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickData {
  end_period_ts: number;
  open_interest: number;
  price?: OHLCData | null;
  volume: number;
  yes_ask?: OHLCData | null;
  yes_bid?: OHLCData | null;
}

interface TimeSeriesData {
  marketTicker: string;
  eventTicker: string;
  eventTitle?: string;
  title?: string;
  timestamps: number[];
  closePrices: number[];
  volumes: number[];
}

interface CorrelationResult {
  market1: string;
  market2: string;
  event1Title?: string;
  event2Title?: string;
  correlation: number;
  pValue?: number;
  dataPoints: number;
}

/**
 * Correlation Analyzer for Kalshi Markets
 * Finds markets with correlated price movements
 */
export class CorrelationAnalyzer {
  private kalshi: KalshiCorrelator;

  constructor(kalshi?: KalshiCorrelator) {
    this.kalshi = kalshi || new KalshiCorrelator();
  }

  /**
   * Fetch candlestick data for a market and convert to time series
   */
  async fetchMarketTimeSeries(
    eventTicker: string,
    marketTicker: string,
    title: string,
    startTs: number,
    endTs: number,
    periodInterval: string = "60",
    eventTitle?: string
  ): Promise<TimeSeriesData | null> {
    try {
      const response = await this.kalshi.getMarketCandlesticks({
        ticker: eventTicker,
        marketTicker: marketTicker,
        startTs,
        endTs,
        periodInterval,
      });

      if (
        !response ||
        !response.candlesticks ||
        response.candlesticks.length === 0
      ) {
        console.log(chalk.yellow(`⚠️  No data for ${marketTicker}`));
        return null;
      }

      // Transform candlestick data to ensure price is available
      const candlesticks = transformCandlestickData(response.candlesticks);

      // Extract close prices and timestamps
      const timestamps: number[] = [];
      const closePrices: number[] = [];
      const volumes: number[] = [];

      for (const candle of candlesticks) {
        if (candle.price && candle.price.close > 0) {
          timestamps.push(candle.end_period_ts);
          closePrices.push(candle.price.close / 100); // Convert cents to dollars
          volumes.push(candle.volume);
        }
      }

      if (closePrices.length === 0) {
        console.log(
          chalk.yellow(`⚠️  No valid price data for ${marketTicker}`)
        );
        return null;
      }

      return {
        marketTicker,
        eventTicker,
        eventTitle,
        title,
        timestamps,
        closePrices,
        volumes,
      };
    } catch (error) {
      console.error(
        chalk.red(`Error fetching data for ${marketTicker}:`),
        error
      );
      return null;
    }
  }

  /**
   * Align two time series based on matching timestamps
   * Returns arrays of prices for the common timestamps
   */
  alignTimeSeries(
    series1: TimeSeriesData,
    series2: TimeSeriesData
  ): { prices1: number[]; prices2: number[]; timestamps: number[] } | null {
    const timestamps: number[] = [];
    const prices1: number[] = [];
    const prices2: number[] = [];

    // Create a map for faster lookup
    const series2Map = new Map<number, number>();
    series1.timestamps.forEach((ts, i) => {
      series2Map.set(ts, series1.closePrices[i]);
    });

    // Find matching timestamps
    series2.timestamps.forEach((ts, i) => {
      if (series2Map.has(ts)) {
        timestamps.push(ts);
        prices1.push(series2Map.get(ts)!);
        prices2.push(series2.closePrices[i]);
      }
    });

    if (timestamps.length < 3) {
      // Need at least 3 points for meaningful correlation
      return null;
    }

    return { prices1, prices2, timestamps };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) {
      return 0;
    }

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  /**
   * Calculate correlation returns (price changes) instead of absolute prices
   * This is often more meaningful for financial data
   */
  calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] !== 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      } else {
        returns.push(0);
      }
    }
    return returns;
  }

  /**
   * Calculate rolling correlation
   */
  calculateRollingCorrelation(
    x: number[],
    y: number[],
    window: number = 20
  ): number[] {
    const correlations: number[] = [];

    for (let i = window; i <= x.length; i++) {
      const xWindow = x.slice(i - window, i);
      const yWindow = y.slice(i - window, i);
      correlations.push(this.calculateCorrelation(xWindow, yWindow));
    }

    return correlations;
  }

  /**
   * Analyze correlation between two markets
   */
  async analyzeMarketPair(
    event1Ticker: string,
    market1Ticker: string,
    market1Title: string,
    event2Ticker: string,
    market2Ticker: string,
    market2Title: string,
    startTs: number,
    endTs: number,
    periodInterval: string = "60"
  ): Promise<CorrelationResult | null> {
    console.log(chalk.blue(`\n🔍 Analyzing correlation between:`));
    console.log(chalk.white(`   ${market1Ticker}: ${market1Title}`));
    console.log(chalk.white(`   ${market2Ticker}: ${market2Title}`));

    // Fetch time series for both markets
    const [series1, series2] = await Promise.all([
      this.fetchMarketTimeSeries(
        event1Ticker,
        market1Ticker,
        market1Title,
        startTs,
        endTs,
        periodInterval
      ),
      this.fetchMarketTimeSeries(
        event2Ticker,
        market2Ticker,
        market2Title,
        startTs,
        endTs,
        periodInterval
      ),
    ]);

    if (!series1 || !series2) {
      console.log(
        chalk.yellow("⚠️  Insufficient data for correlation analysis")
      );
      return null;
    }

    // Align time series
    const aligned = this.alignTimeSeries(series1, series2);
    if (!aligned) {
      console.log(
        chalk.yellow("⚠️  Not enough overlapping data points for correlation")
      );
      return null;
    }

    // Calculate correlation on price levels
    const priceCorrelation = this.calculateCorrelation(
      aligned.prices1,
      aligned.prices2
    );

    // Calculate correlation on returns (price changes)
    const returns1 = this.calculateReturns(aligned.prices1);
    const returns2 = this.calculateReturns(aligned.prices2);
    const returnsCorrelation =
      returns1.length > 0 ? this.calculateCorrelation(returns1, returns2) : 0;

    return {
      market1: market1Ticker,
      market2: market2Ticker,
      correlation: returnsCorrelation, // Use returns correlation as primary metric
      dataPoints: aligned.timestamps.length,
    };
  }

  /**
   * Analyze correlations across multiple markets
   */
  async analyzeMultipleMarkets(
    markets: Array<{
      eventTicker: string;
      marketTicker: string;
      title: string;
      eventTitle?: string;
    }>,
    startTs: number,
    endTs: number,
    periodInterval: string = "60"
  ): Promise<CorrelationResult[]> {
    console.log(
      chalk.bold.cyan(
        `\n📊 Analyzing correlations for ${markets.length} markets...`
      )
    );

    // Fetch all time series data
    const timeSeriesData: TimeSeriesData[] = [];

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];

      // Show progress for every 10th market or first/last
      if (i === 0 || i === markets.length - 1 || (i + 1) % 10 === 0) {
        console.log(
          chalk.gray(
            `Fetching ${i + 1}/${markets.length}: ${market.marketTicker}...`
          )
        );
      }

      const series = await this.fetchMarketTimeSeries(
        market.eventTicker,
        market.marketTicker,
        market.title,
        startTs,
        endTs,
        periodInterval,
        market.eventTitle
      );
      if (series) {
        timeSeriesData.push(series);
      }
    }

    console.log(
      chalk.green(
        `\n✓ Successfully fetched ${timeSeriesData.length} time series`
      )
    );

    // Calculate pairwise correlations
    const correlations: CorrelationResult[] = [];
    let skippedSameEvent = 0;

    console.log(chalk.gray("\nCalculating pairwise correlations..."));

    for (let i = 0; i < timeSeriesData.length; i++) {
      for (let j = i + 1; j < timeSeriesData.length; j++) {
        const series1 = timeSeriesData[i];
        const series2 = timeSeriesData[j];

        // Skip if both markets are from the same event
        if (series1.eventTicker === series2.eventTicker) {
          skippedSameEvent++;
          continue;
        }

        // Align time series
        const aligned = this.alignTimeSeries(series1, series2);
        if (!aligned || aligned.timestamps.length < 10) {
          continue;
        }

        // Calculate correlation on returns
        const returns1 = this.calculateReturns(aligned.prices1);
        const returns2 = this.calculateReturns(aligned.prices2);

        if (returns1.length > 0 && returns2.length > 0) {
          const correlation = this.calculateCorrelation(returns1, returns2);

          correlations.push({
            market1: series1.marketTicker,
            market2: series2.marketTicker,
            event1Title: series1.eventTitle,
            event2Title: series2.eventTitle,
            correlation,
            dataPoints: aligned.timestamps.length,
          });
        }
      }
    }

    if (skippedSameEvent > 0) {
      console.log(chalk.gray(`Skipped ${skippedSameEvent} same-event pair(s)`));
    }

    return correlations;
  }

  /**
   * Display correlation matrix
   */
  displayCorrelationMatrix(
    correlations: CorrelationResult[],
    threshold: number = 0.3
  ): void {
    console.log(
      chalk.bold.cyan("\n📈 Cross-Event Correlation Analysis Results")
    );
    console.log(chalk.gray("(Markets from the same event are excluded)"));
    console.log(chalk.gray("=".repeat(80)));

    // Sort by absolute correlation value
    const sortedCorrelations = correlations.sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
    );

    // Filter by threshold
    const significantCorrelations = sortedCorrelations.filter(
      (c) => Math.abs(c.correlation) >= threshold
    );

    if (significantCorrelations.length === 0) {
      console.log(
        chalk.yellow(
          `\n⚠️  No correlations found above threshold ${threshold.toFixed(2)}`
        )
      );
      return;
    }

    // Create table for correlations
    const table = new Table({
      head: [
        chalk.cyan("Market 1"),
        chalk.cyan("Event 1"),
        chalk.cyan("Market 2"),
        chalk.cyan("Event 2"),
        chalk.cyan("Correlation"),
        chalk.cyan("Strength"),
        chalk.cyan("Data Points"),
      ],
      style: {
        head: [],
        border: ["gray"],
      },
      colWidths: [20, 30, 20, 30, 12, 12, 12],
    });

    significantCorrelations.forEach((result) => {
      const corrValue = result.correlation.toFixed(3);
      const strength = this.getCorrelationStrength(result.correlation);
      const color = this.getCorrelationColor(result.correlation);

      table.push([
        result.market1,
        chalk.gray(result.event1Title || "N/A"),
        result.market2,
        chalk.gray(result.event2Title || "N/A"),
        color(corrValue),
        color(strength),
        result.dataPoints.toString(),
      ]);
    });

    console.log(table.toString());

    // Show summary statistics
    console.log(chalk.bold.white("\n📊 Summary Statistics"));
    console.log(chalk.white(`Total pairs analyzed: ${correlations.length}`));
    console.log(
      chalk.white(
        `Significant correlations (|r| ≥ ${threshold}): ${significantCorrelations.length}`
      )
    );

    const positiveCorrelations = significantCorrelations.filter(
      (c) => c.correlation > 0
    ).length;
    const negativeCorrelations = significantCorrelations.filter(
      (c) => c.correlation < 0
    ).length;

    console.log(chalk.green(`Positive correlations: ${positiveCorrelations}`));
    console.log(chalk.red(`Negative correlations: ${negativeCorrelations}`));

    if (significantCorrelations.length > 0) {
      const avgCorrelation =
        significantCorrelations.reduce(
          (sum, c) => sum + Math.abs(c.correlation),
          0
        ) / significantCorrelations.length;
      console.log(
        chalk.white(
          `Average absolute correlation: ${avgCorrelation.toFixed(3)}`
        )
      );
    }

    console.log(chalk.gray("\n" + "=".repeat(80)));
  }

  /**
   * Get correlation strength descriptor
   */
  private getCorrelationStrength(correlation: number): string {
    const abs = Math.abs(correlation);
    if (abs >= 0.9) return "Very Strong";
    if (abs >= 0.7) return "Strong";
    if (abs >= 0.5) return "Moderate";
    if (abs >= 0.3) return "Weak";
    return "Very Weak";
  }

  /**
   * Get color based on correlation value
   */
  private getCorrelationColor(correlation: number): typeof chalk.green {
    const abs = Math.abs(correlation);
    if (correlation > 0) {
      if (abs >= 0.7) return chalk.green.bold;
      if (abs >= 0.5) return chalk.green;
      return chalk.greenBright;
    } else {
      if (abs >= 0.7) return chalk.red.bold;
      if (abs >= 0.5) return chalk.red;
      return chalk.redBright;
    }
  }

  /**
   * Find most correlated markets
   */
  findTopCorrelations(
    correlations: CorrelationResult[],
    top: number = 10
  ): CorrelationResult[] {
    return correlations
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, top);
  }

  /**
   * Find markets correlated with a specific target market
   */
  findCorrelatedWith(
    targetMarket: string,
    correlations: CorrelationResult[],
    threshold: number = 0.3
  ): CorrelationResult[] {
    return correlations
      .filter(
        (c) =>
          (c.market1 === targetMarket || c.market2 === targetMarket) &&
          Math.abs(c.correlation) >= threshold
      )
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * Deduplicate correlations from multiple analysis windows
   * Keeps the correlation with more data points if duplicates exist
   */
  deduplicateCorrelations(
    correlations: CorrelationResult[]
  ): CorrelationResult[] {
    const correlationMap = new Map<string, CorrelationResult>();

    for (const corr of correlations) {
      // Create a unique key for this pair (order-independent)
      const key =
        corr.market1 < corr.market2
          ? `${corr.market1}|${corr.market2}`
          : `${corr.market2}|${corr.market1}`;

      const existing = correlationMap.get(key);

      // Keep the correlation with more data points, or if equal, the stronger correlation
      if (
        !existing ||
        corr.dataPoints > existing.dataPoints ||
        (corr.dataPoints === existing.dataPoints &&
          Math.abs(corr.correlation) > Math.abs(existing.correlation))
      ) {
        correlationMap.set(key, corr);
      }
    }

    return Array.from(correlationMap.values());
  }
}
