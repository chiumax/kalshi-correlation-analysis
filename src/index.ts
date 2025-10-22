import "dotenv/config";
import chalk from "chalk";
import { KalshiCorrelator } from "./quickstart.js";
import { plotLineChart } from "./candlestick-plotter.js";
import { CorrelationAnalyzer } from "./correlation-analyzer.js";

console.log(chalk.bold.cyan("Kalshi Correlator - Starting..."));

const log = console.log;

// Configuration
const VOLUME_THRESHOLD = 10000; // Minimum market volume
const MAX_MARKETS = 100; // Maximum markets to analyze
const WINDOW_SIZE = 50; // Markets per analysis window

/**
 * Main entry point with correlation analysis
 */
async function main() {
  try {
    // Check if environment variables are set
    if (!process.env.KALSHI_API_KEY) {
      log(chalk.yellow("\n⚠️  Environment variables not set"));
      log(
        chalk.white(
          "\nTo use this quickstart, please set the following environment variables:"
        )
      );
      log(chalk.yellow("  - KALSHI_API_KEY"));
      log(
        chalk.yellow("  - KALSHI_PRIVATE_KEY_PATH (or KALSHI_PRIVATE_KEY_PEM)")
      );
      log(chalk.yellow("  - KALSHI_BASE_PATH (optional)\n"));
      log(chalk.white("Example:"));
      log(chalk.yellow('  export KALSHI_API_KEY="your-api-key-id"'));
      log(
        chalk.yellow(
          '  export KALSHI_PRIVATE_KEY_PATH="path/to/private-key.pem"'
        )
      );
      log(chalk.yellow("  npm run dev\n"));
      log(chalk.white("Or create a .env file based on .env.example\n"));
      process.exit(0);
    }

    // Initialize Kalshi client and correlation analyzer
    const kalshi = new KalshiCorrelator();
    const analyzer = new CorrelationAnalyzer(kalshi);

    // Get events with markets (fetch up to 200 events)
    log(chalk.blue("\n🔍 Fetching events and markets..."));
    const events = await kalshi.getEvents(500);
    console.log(events?.length);

    if (!events || events.length === 0) {
      log(chalk.yellow("\n⚠️  No events found"));
      return;
    }

    const eventsWithMarkets = events.filter(
      (event) => event.markets && event.markets.length > 0
    );

    log(
      chalk.green(`\n✓ Found ${eventsWithMarkets.length} events with markets`)
    );

    // Display first event's candlestick chart
    if (
      eventsWithMarkets.length > 0 &&
      eventsWithMarkets[0].markets &&
      eventsWithMarkets[0].markets.length > 0
    ) {
      log(chalk.bold.white("\n📊 Sample Market Chart\n"));

      const candlesticks = await kalshi.getMarketCandlesticks({
        ticker: eventsWithMarkets[0].event_ticker || "",
        marketTicker: eventsWithMarkets[0].markets[0].ticker || "",
        startTs: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30,
        endTs: Math.floor(Date.now() / 1000),
        periodInterval: "60",
      });

      if (candlesticks && candlesticks.candlesticks) {
        plotLineChart(candlesticks);
      }
    }

    // Perform correlation analysis
    log(chalk.bold.cyan("\n🔗 Starting Correlation Analysis\n"));

    // Collect markets from UNIQUE events (1 market per event, up to 100 events)
    // This ensures we only analyze cross-event correlations
    const allMarkets: Array<{
      eventTicker: string;
      marketTicker: string;
      title: string;
      eventTitle?: string;
    }> = [];

    log(
      chalk.gray(
        `Collecting one market from each unique event (volume > ${(
          VOLUME_THRESHOLD / 1000
        ).toFixed(0)}k)...\n`
      )
    );

    // Sort events by maximum market volume in descending order
    eventsWithMarkets.sort((a, b) => {
      const maxVolumeA = Math.max(
        ...(a.markets?.map((m) => m.volume || 0) || [0])
      );
      const maxVolumeB = Math.max(
        ...(b.markets?.map((m) => m.volume || 0) || [0])
      );
      return maxVolumeB - maxVolumeA;
    });

    let skippedLowVolume = 0;

    for (const event of eventsWithMarkets) {
      if (allMarkets.length >= MAX_MARKETS) break;

      if (event.markets && event.markets.length > 0) {
        // Find the first market from this event with volume > 100k
        let selectedMarket = null;

        for (const market of event.markets) {
          const marketVolume = market.volume || 0;

          if (marketVolume > VOLUME_THRESHOLD) {
            selectedMarket = market;
            break;
          }
        }

        // If no market in this event meets the volume threshold, skip the event
        if (!selectedMarket) {
          skippedLowVolume++;
          continue;
        }

        const marketVolume = selectedMarket.volume || 0;

        allMarkets.push({
          eventTicker: event.event_ticker || "",
          marketTicker: selectedMarket.ticker || "",
          title: selectedMarket.title || selectedMarket.ticker || "Unknown",
          eventTitle: event.title,
        });

        if (allMarkets.length <= 10 || allMarkets.length % 10 === 0) {
          log(
            chalk.gray(
              `  ${allMarkets.length}. ${selectedMarket.ticker} (vol: ${(
                marketVolume / 1000
              ).toFixed(0)}k) from "${event.title}"`
            )
          );
        }
      }
    }

    if (skippedLowVolume > 0) {
      log(
        chalk.yellow(
          `\n⚠️  Skipped ${skippedLowVolume} event(s) with volume ≤ ${(
            VOLUME_THRESHOLD / 1000
          ).toFixed(0)}k`
        )
      );
    }

    log(
      chalk.green(
        `\n✓ Collected ${allMarkets.length} markets from unique events`
      )
    );

    if (allMarkets.length < 2) {
      log(
        chalk.yellow("\n⚠️  Need at least 2 markets for correlation analysis")
      );
      log(chalk.gray(`Found only ${allMarkets.length} market(s)`));
      return;
    }

    // Define time range (last 30 days)
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - 60 * 60 * 24 * 30;

    // Rolling window analysis
    log(
      chalk.bold.white(
        `\n📊 Performing Rolling Window Analysis (${WINDOW_SIZE} markets per window)\n`
      )
    );

    const allCorrelations: any[] = [];
    let windowCount = 0;

    // Analyze first window
    if (allMarkets.length >= WINDOW_SIZE) {
      windowCount++;
      const marketsWindow = allMarkets.slice(0, WINDOW_SIZE);

      log(
        chalk.cyan(
          `\n🔄 Window ${windowCount}: Analyzing first ${WINDOW_SIZE} markets...`
        )
      );

      const correlations = await analyzer.analyzeMultipleMarkets(
        marketsWindow,
        startTs,
        endTs,
        "60" // 1-hour intervals
      );

      allCorrelations.push(...correlations);

      log(
        chalk.green(
          `✓ Found ${correlations.length} correlations in window ${windowCount}`
        )
      );
    } else {
      // If less than 50 markets, analyze all
      windowCount++;
      log(
        chalk.cyan(
          `\n🔄 Window ${windowCount}: Analyzing all ${allMarkets.length} markets...`
        )
      );

      const correlations = await analyzer.analyzeMultipleMarkets(
        allMarkets,
        startTs,
        endTs,
        "60"
      );

      allCorrelations.push(...correlations);

      log(chalk.green(`✓ Found ${correlations.length} correlations`));
    }

    // If we have more markets, analyze next window
    if (allMarkets.length > WINDOW_SIZE) {
      windowCount++;
      const endIdx = Math.min(WINDOW_SIZE * 2, allMarkets.length);
      const marketsWindow = allMarkets.slice(WINDOW_SIZE, endIdx);

      if (marketsWindow.length >= 2) {
        log(
          chalk.cyan(
            `\n🔄 Window ${windowCount}: Analyzing markets ${
              WINDOW_SIZE + 1
            }-${endIdx}...`
          )
        );

        const correlations = await analyzer.analyzeMultipleMarkets(
          marketsWindow,
          startTs,
          endTs,
          "60"
        );

        allCorrelations.push(...correlations);

        log(
          chalk.green(
            `✓ Found ${correlations.length} correlations in window ${windowCount}`
          )
        );
      }
    }

    // Deduplicate and combine correlations
    log(chalk.blue(`\n📊 Combining results from ${windowCount} window(s)...`));
    const correlations = analyzer.deduplicateCorrelations(allCorrelations);
    log(chalk.green(`✓ Total unique correlations: ${correlations.length}`));

    // Display correlation matrix
    analyzer.displayCorrelationMatrix(correlations, 0.3);

    // Show top correlations
    log(chalk.bold.white("\n🏆 Top 20 Correlations\n"));
    const topCorrelations = analyzer.findTopCorrelations(correlations, 20);

    if (topCorrelations.length > 0) {
      topCorrelations.forEach((result, index) => {
        const color = result.correlation > 0 ? chalk.green : chalk.red;
        const symbol = result.correlation > 0 ? "↑" : "↓";
        log(
          chalk.white(`${(index + 1).toString().padStart(2)}. `) +
            chalk.gray(
              `${result.market1.padEnd(25)} ↔ ${result.market2.padEnd(25)} `
            ) +
            color(`${symbol} ${result.correlation.toFixed(3)}`)
        );
      });
    } else {
      log(chalk.yellow("No significant correlations found"));
    }

    log(chalk.bold.green("\n✅ Analysis complete!\n"));
  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error);
    process.exit(1);
  }
}

// Run main function
main();

export {};
