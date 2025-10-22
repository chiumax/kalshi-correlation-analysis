import {
  Configuration,
  PortfolioApi,
  ExchangeApi,
  MarketsApi,
  Market,
  EventsApi,
  Event,
} from "kalshi-typescript";
import chalk from "chalk";
import { createKalshiConfig } from "./config.js";
const log = console.log;
/**
 * Kalshi SDK Quick Start Example
 * Demonstrates basic usage of the Kalshi TypeScript SDK
 */
export class KalshiCorrelator {
  private config: Configuration;
  private portfolioApi: PortfolioApi;
  private exchangeApi: ExchangeApi;
  private marketsApi: MarketsApi;
  private eventsApi: EventsApi;

  constructor(config?: Configuration) {
    this.config = config || createKalshiConfig();
    this.portfolioApi = new PortfolioApi(this.config);
    this.exchangeApi = new ExchangeApi(this.config);
    this.marketsApi = new MarketsApi(this.config);
    this.eventsApi = new EventsApi(this.config);
  }

  /**
   * Get and display account balance
   */
  async getBalance(): Promise<void> {
    try {
      console.log(chalk.blue("\n📊 Fetching account balance..."));
      const balance = await this.portfolioApi.getBalance();
      const balanceAmount = (balance.data.balance || 0) / 100;
      console.log(chalk.green(`Balance: $${balanceAmount.toFixed(2)}`));
    } catch (error) {
      console.error(chalk.red("Error fetching balance:"), error);
      throw error;
    }
  }

  /**
   * Get exchange status
   */
  async getExchangeStatus(): Promise<void> {
    try {
      console.log(chalk.blue("\n🔄 Fetching exchange status..."));
      const status = await this.exchangeApi.getExchangeStatus();
      console.log(chalk.green("Exchange Status:"), status.data);
    } catch (error) {
      console.error(chalk.red("Error fetching exchange status:"), error);
      throw error;
    }
  }

  /**
   * Get market information
   */
  async getMarkets(limit: number = 5): Promise<void> {
    try {
      console.log(chalk.blue(`\n📈 Fetching top ${limit} markets...`));
      const markets = await this.marketsApi.getMarkets(
        limit,
        undefined, // cursor
        undefined, // event_ticker
        undefined, // series_ticker
        1 // 1 = open, 2 = closed
      );

      if (markets.data.markets && markets.data.markets.length > 0) {
        console.log(
          chalk.green(`\nFound ${markets.data.markets.length} markets:`)
        );
        markets.data.markets.forEach((market: any, index: number) => {
          console.log(
            chalk.white(`\n${index + 1}. ${market.title || "Untitled Market"}`)
          );
          console.log(chalk.gray(`   Ticker: ${market.ticker || "N/A"}`));
          console.log(chalk.gray(`   Status: ${market.status || "N/A"}`));
        });
      } else {
        console.log(chalk.yellow("No markets found"));
      }
    } catch (error) {
      console.error(chalk.red("Error fetching markets:"), error);
      throw error;
    }
  }

  /**
   * Get portfolio positions
   */
  async getPortfolio(): Promise<void> {
    try {
      console.log(chalk.blue("\n💼 Fetching portfolio positions..."));
      const positions = await this.portfolioApi.getPositions();

      if (
        positions.data.market_positions &&
        positions.data.market_positions.length > 0
      ) {
        console.log(
          chalk.green(
            `\nFound ${positions.data.market_positions.length} positions:`
          )
        );
        positions.data.market_positions.forEach(
          (position: any, index: number) => {
            console.log(
              chalk.white(
                `\n${index + 1}. ${position.market_ticker || "Unknown"}`
              )
            );
            console.log(chalk.gray(`   Position: ${position.position || 0}`));
          }
        );
      } else {
        console.log(chalk.yellow("No positions found"));
      }
    } catch (error) {
      console.error(chalk.red("Error fetching portfolio:"), error);
      throw error;
    }
  }

  /**
   * Run all quick start examples
   */
  async runAll(): Promise<void> {
    console.log(chalk.bold.cyan("\n🚀 Kalshi TypeScript SDK Quick Start\n"));
    console.log(chalk.gray("=".repeat(50)));

    try {
      await this.getBalance();
      await this.getExchangeStatus();
      await this.getMarkets(5);
      await this.getPortfolio();

      console.log(chalk.gray("\n" + "=".repeat(50)));
      console.log(
        chalk.bold.green("\n✅ Quick start completed successfully!\n")
      );
    } catch (error) {
      console.log(chalk.gray("\n" + "=".repeat(50)));
      console.log(chalk.bold.red("\n❌ Quick start failed\n"));
      throw error;
    }
  }

  async getMarketCandlesticks(config: MarketsCandlesticksConfig): Promise<any> {
    const { status, data } = await this.marketsApi.getMarketCandlesticks(
      config.ticker,
      config.marketTicker,
      config.startTs,
      config.endTs,
      config.periodInterval
    );
    return data;
  }

  async test(): Promise<Market[] | undefined> {
    const config: MarketsConfig = {
      limit: 2,
    };
    const { status, data } = await this.marketsApi.getMarkets(config.limit);

    return data?.markets;
  }

  async getEvents(limit: number = 200): Promise<Event[] | undefined> {
    const allEvents: Event[] = [];
    let cursor: string | undefined = undefined;
    const pageSize = 100; // Fetch 100 events at a time

    const config: EventsConfig = {
      limit: pageSize,
      cursor: undefined,
      withNestedMarkets: true,
      status: undefined,
      seriesTicker: undefined,
      minCloseTs: undefined,
    };

    // Keep fetching until we have enough events or there are no more pages
    while (allEvents.length < limit) {
      config.cursor = cursor;

      const { status, data } = await this.eventsApi.getEvents(
        config.limit,
        config.cursor,
        config.withNestedMarkets,
        config.status,
        config.seriesTicker,
        config.minCloseTs
      );

      if (data?.events && data.events.length > 0) {
        allEvents.push(...data.events);
        console.log(
          chalk.gray(
            `Fetched ${data.events.length} events (total: ${allEvents.length})`
          )
        );
      }

      // Check if there's a next cursor for pagination
      cursor = data?.cursor;

      // Break if no more pages or we've reached the desired limit
      if (!cursor || allEvents.length >= limit) {
        break;
      }
    }

    // Return only the requested number of events
    return allEvents.slice(0, limit);
  }
}

interface EventsConfig {
  limit?: number; // number of results
  cursor?: string; // pagination cursor -- don't need to set
  withNestedMarkets?: boolean; // if true, markets are included within the event object
  status?: string; // filter
  seriesTicker?: string; // filter
  minCloseTs?: number; // filter
}

interface MarketsConfig {
  limit?: number; // number of results
  cursor?: string; // pagination cursor -- don't need to set
  eventTicker?: string; // filter
  seriesTicker?: string; // filter
  maxCloseTs?: number;
  minCloseTs?: number;
  status?: string;
  tickers?: string;
}

interface MarketsCandlesticksConfig {
  ticker: string; //The series ticker (default to undefined)
  marketTicker: string; //The market ticker (default to undefined)
  startTs: number; //Start timestamp for the range (optional) (default to undefined)
  endTs: number; //End timestamp for the range (optional) (default to undefined)
  periodInterval: string; //Period interval for candlesticks (e.g., 1m, 5m, 1h, 1d) (optional) (default to undefined)
}

/**
 * Basic usage example
 */
export async function basicExample(): Promise<void> {
  // Configure the SDK
  const config = new Configuration({
    apiKey: process.env.KALSHI_API_KEY || "your-api-key-id",
    privateKeyPath:
      process.env.KALSHI_PRIVATE_KEY_PATH || "path/to/your/private-key.pem",
    basePath:
      process.env.KALSHI_BASE_PATH ||
      "https://api.elections.kalshi.com/trade-api/v2",
  });

  // Create API instance
  const portfolioApi = new PortfolioApi(config);

  // Make API calls
  const balance = await portfolioApi.getBalance();
  console.log(`Balance: $${(balance.data.balance || 0) / 100}`);
}
