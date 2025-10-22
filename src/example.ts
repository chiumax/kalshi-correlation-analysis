/**
 * Basic Kalshi SDK Usage Example
 *
 * This file demonstrates the simplest way to use the Kalshi TypeScript SDK
 */

import { Configuration, PortfolioApi } from "kalshi-typescript";

async function simpleExample() {
  // Configure the SDK
  const config = new Configuration({
    apiKey: process.env.KALSHI_API_KEY || "your-api-key-id",
    privateKeyPath:
      process.env.KALSHI_PRIVATE_KEY_PATH || "path/to/your/private-key.pem",
    basePath: "https://api.elections.kalshi.com/trade-api/v2",
  });

  // Create API instance
  const portfolioApi = new PortfolioApi(config);

  // Make API calls
  try {
    const balance = await portfolioApi.getBalance();
    console.log(`Balance: $${(balance.data.balance || 0) / 100}`);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  simpleExample();
}

export { simpleExample };
