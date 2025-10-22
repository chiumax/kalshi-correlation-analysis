import asciichart from "asciichart";
import Table from "cli-table3";
import chalk, { type ChalkInstance } from "chalk";
import dayjs from "dayjs";

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

interface CandlesticksResponse {
  candlesticks: CandlestickData[];
  ticker: string;
}

/**
 * Transform candlestick data by computing average price from yes_ask and yes_bid
 * when price is null or missing
 */
export function transformCandlestickData(
  candlesticks: CandlestickData[]
): CandlestickData[] {
  return candlesticks.map((candle) => {
    // If price exists and is not null, return as is
    if (candle.price?.close) {
      return candle;
    }

    // If price is null but we have yes_ask and yes_bid, compute average
    if (candle.yes_ask && candle.yes_bid) {
      const averagePrice: OHLCData = {
        open: (candle.yes_ask.open + candle.yes_bid.open) / 2,
        high: (candle.yes_ask.high + candle.yes_bid.high) / 2,
        low: (candle.yes_ask.low + candle.yes_bid.low) / 2,
        close: (candle.yes_ask.close + candle.yes_bid.close) / 2,
      };

      return {
        ...candle,
        price: averagePrice,
      };
    }

    // If we only have yes_ask, use that
    if (candle.yes_ask) {
      return {
        ...candle,
        price: candle.yes_ask,
      };
    }

    // If we only have yes_bid, use that
    if (candle.yes_bid) {
      return {
        ...candle,
        price: candle.yes_bid,
      };
    }

    // If nothing is available, return with a default price of 0
    return {
      ...candle,
      price: {
        open: 0,
        high: 0,
        low: 0,
        close: 0,
      },
    };
  });
}

/**
 * Format cents to dollar string
 */
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format timestamp to readable date
 */
function formatTimestamp(ts: number): string {
  return dayjs.unix(ts).format("MM/DD HH:mm");
}

/**
 * Get color for price change
 */
function getPriceColor(open: number, close: number): typeof chalk.green {
  if (close > open) return chalk.green;
  if (close < open) return chalk.red;
  return chalk.gray;
}

/**
 * Create ASCII candlestick representation
 */
function createCandlestickChar(candle: CandlestickData): string {
  if (!candle.price) {
    return chalk.gray("?");
  }

  const { open, high, low, close } = candle.price;

  if (close > open) {
    // Bullish (green)
    return chalk.green("▓");
  } else if (close < open) {
    // Bearish (red)
    return chalk.red("▒");
  } else {
    // No change (gray)
    return chalk.gray("░");
  }
}

/**
 * Plot simple line chart of close prices
 */
export function plotLineChart(response: CandlesticksResponse): void {
  let candlesticks = response.candlesticks;

  if (!candlesticks || candlesticks.length === 0) {
    console.log(chalk.yellow("\n⚠️  No candlestick data to plot"));
    return;
  }

  // Transform candlestick data to ensure price is available
  candlesticks = transformCandlestickData(candlesticks);

  console.log(chalk.bold.cyan(`\n📊 Price Chart: ${response.ticker}`));
  console.log(chalk.gray("=".repeat(80)));

  // Extract close prices and convert from cents to dollars
  const closePrices = candlesticks
    .filter((c) => c.price)
    .map((c) => c.price!.close / 100);

  // Create simple line chart
  const config = {
    height: 15,
    colors: [asciichart.green],
  };

  // filter out every n price for width reasons
  const factor = Math.round(closePrices.length / 150)
  const filteredClosePrices =  closePrices.filter(function (value, index, Arr) {
    return index % factor == 0
  })

  const plot = asciichart.plot(filteredClosePrices, config);

  console.log(plot);
  console.log(
    chalk.gray(
      `Time range: ${formatTimestamp(
        candlesticks[0].end_period_ts
      )} → ${formatTimestamp(
        candlesticks[candlesticks.length - 1].end_period_ts
      )}`
    )
  );
  console.log(chalk.gray(`Data points: ${candlesticks.length} candles`));

  // Show basic stats
  const firstPrice = closePrices[0];
  const lastPrice = closePrices[closePrices.length - 1];
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = ((priceChange / firstPrice) * 100).toFixed(2);
  const changeColor = priceChange >= 0 ? chalk.green : chalk.red;
  const changeSymbol = priceChange >= 0 ? "↑" : "↓";

  console.log(
    chalk.white(`\nOpening: ${formatPrice(firstPrice * 100)}  `) +
      chalk.white(`Closing: ${formatPrice(lastPrice * 100)}  `) +
      changeColor(
        `${changeSymbol} ${formatPrice(
          Math.abs(priceChange) * 100
        )} (${priceChangePercent}%)`
      )
  );
  console.log(chalk.gray("=".repeat(80)) + "\n");
}

/**
 * Plot candlestick data as ASCII chart (full version with all details)
 */
export function plotCandlesticks(response: CandlesticksResponse): void {
  let candlesticks = response.candlesticks;

  if (!candlesticks || candlesticks.length === 0) {
    console.log(chalk.yellow("\n⚠️  No candlestick data to plot"));
    return;
  }

  // Transform candlestick data to ensure price is available
  candlesticks = transformCandlestickData(candlesticks);

  console.log(chalk.bold.cyan(`\n📊 Candlestick Chart: ${response.ticker}`));
  console.log(chalk.gray("=".repeat(80)));

  // Plot OHLC prices
  plotPriceChart(candlesticks);

  // Plot volume
  plotVolumeChart(candlesticks);

  // Show detailed table
  showCandlestickTable(candlesticks);

  // Show summary statistics
  showSummaryStats(candlesticks);
}

/**
 * Plot price chart with OHLC data
 */
function plotPriceChart(candlesticks: CandlestickData[]): void {
  console.log(chalk.bold.white("\n📈 Price Chart (Close Prices)"));

  const closePrices = candlesticks
    .filter((c) => c.price)
    .map((c) => c.price!.close / 100);
  const highPrices = candlesticks
    .filter((c) => c.price)
    .map((c) => c.price!.high / 100);
  const lowPrices = candlesticks
    .filter((c) => c.price)
    .map((c) => c.price!.low / 100);

  // Create chart with close prices
  const config = {
    height: 15,
    colors: [
      asciichart.green, // Close prices
      asciichart.red, // High prices (as reference)
      asciichart.blue, // Low prices (as reference)
    ],
  };

  const plot = asciichart.plot([closePrices, highPrices, lowPrices], config);

  console.log(plot);
  console.log(
    chalk.gray(
      `Time range: ${formatTimestamp(
        candlesticks[0].end_period_ts
      )} → ${formatTimestamp(
        candlesticks[candlesticks.length - 1].end_period_ts
      )}`
    )
  );
  console.log(
    chalk.green("▬") +
      " Close " +
      chalk.red("▬") +
      " High " +
      chalk.blue("▬") +
      " Low"
  );
}

/**
 * Plot volume chart
 */
function plotVolumeChart(candlesticks: CandlestickData[]): void {
  console.log(chalk.bold.white("\n📊 Volume Chart"));

  const volumes = candlesticks.map((c) => c.volume);
  const maxVolume = Math.max(...volumes);

  // Create simple bar chart
  const barWidth = 60;
  candlesticks.slice(-10).forEach((candle, idx) => {
    const barLength = Math.floor((candle.volume / maxVolume) * barWidth);
    const bar = "█".repeat(barLength);
    const time = formatTimestamp(candle.end_period_ts);
    const color = candle.price
      ? getPriceColor(candle.price.open, candle.price.close)
      : chalk.gray;

    console.log(
      `${chalk.gray(time)} ${color(bar)} ${chalk.white(
        candle.volume.toLocaleString()
      )}`
    );
  });
}

/**
 * Show detailed candlestick table
 */
function showCandlestickTable(candlesticks: CandlestickData[]): void {
  console.log(chalk.bold.white("\n📋 Candlestick Details (Last 10)"));

  const table = new Table({
    head: [
      chalk.cyan("Time"),
      chalk.cyan("Open"),
      chalk.cyan("High"),
      chalk.cyan("Low"),
      chalk.cyan("Close"),
      chalk.cyan("Volume"),
      chalk.cyan("OI"),
      chalk.cyan("Trend"),
    ],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  // Show last 10 candlesticks
  const recentCandles = candlesticks.slice(-10);

  recentCandles.forEach((candle) => {
    if (!candle.price) {
      table.push([
        formatTimestamp(candle.end_period_ts),
        chalk.gray("N/A"),
        chalk.gray("N/A"),
        chalk.gray("N/A"),
        chalk.gray("N/A"),
        candle.volume.toLocaleString(),
        candle.open_interest.toLocaleString(),
        chalk.gray("N/A"),
      ]);
      return;
    }

    const { open, high, low, close } = candle.price;
    const color = getPriceColor(open, close);
    const trend = close > open ? "↑ Bull" : close < open ? "↓ Bear" : "→ Flat";

    table.push([
      formatTimestamp(candle.end_period_ts),
      color(formatPrice(open)),
      chalk.yellow(formatPrice(high)),
      chalk.blue(formatPrice(low)),
      color(formatPrice(close)),
      candle.volume.toLocaleString(),
      candle.open_interest.toLocaleString(),
      color(trend),
    ]);
  });

  console.log(table.toString());
}

/**
 * Show summary statistics
 */
function showSummaryStats(candlesticks: CandlestickData[]): void {
  console.log(chalk.bold.white("\n📊 Summary Statistics"));

  const validCandles = candlesticks.filter((c) => c.price);
  if (validCandles.length === 0) {
    console.log(chalk.yellow("No valid price data available"));
    return;
  }

  const closePrices = validCandles.map((c) => c.price!.close);
  const volumes = candlesticks.map((c) => c.volume);

  const firstPrice = closePrices[0];
  const lastPrice = closePrices[closePrices.length - 1];
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = ((priceChange / firstPrice) * 100).toFixed(2);

  const highestPrice = Math.max(...validCandles.map((c) => c.price!.high));
  const lowestPrice = Math.min(...validCandles.map((c) => c.price!.low));
  const avgVolume = Math.floor(
    volumes.reduce((a, b) => a + b, 0) / volumes.length
  );
  const totalVolume = volumes.reduce((a, b) => a + b, 0);

  const changeColor = priceChange >= 0 ? chalk.green : chalk.red;
  const changeSymbol = priceChange >= 0 ? "↑" : "↓";

  const statsTable = new Table({
    style: {
      head: [],
      border: ["gray"],
    },
  });

  statsTable.push(
    [chalk.white("Period"), `${candlesticks.length} candles`],
    [chalk.white("Opening Price"), formatPrice(firstPrice)],
    [chalk.white("Closing Price"), formatPrice(lastPrice)],
    [
      chalk.white("Price Change"),
      changeColor(
        `${changeSymbol} ${formatPrice(
          Math.abs(priceChange)
        )} (${priceChangePercent}%)`
      ),
    ],
    [chalk.white("Highest Price"), chalk.yellow(formatPrice(highestPrice))],
    [chalk.white("Lowest Price"), chalk.blue(formatPrice(lowestPrice))],
    [chalk.white("Price Range"), formatPrice(highestPrice - lowestPrice)],
    [chalk.white("Total Volume"), totalVolume.toLocaleString()],
    [chalk.white("Average Volume"), avgVolume.toLocaleString()],
    [
      chalk.white("Last Open Interest"),
      candlesticks[candlesticks.length - 1].open_interest.toLocaleString(),
    ]
  );

  console.log(statsTable.toString());
}

/**
 * Plot simple candlestick visual representation
 */
export function plotCandlestickBars(candlesticks: CandlestickData[]): void {
  console.log(chalk.bold.white("\n🕯️  Candlestick Pattern"));

  const recentCandles = candlesticks.slice(-20);
  let output = "\n";

  recentCandles.forEach((candle, idx) => {
    output += createCandlestickChar(candle);

    // Add spacing every 5 candles
    if ((idx + 1) % 5 === 0) {
      output += " ";
    }
  });

  console.log(output);
  console.log(
    chalk.gray("Legend: ") +
      chalk.green("▓") +
      " Bullish  " +
      chalk.red("▒") +
      " Bearish  " +
      chalk.gray("░") +
      " Neutral\n"
  );
}
