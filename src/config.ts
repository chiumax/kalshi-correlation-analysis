import { Configuration } from "kalshi-typescript";

/**
 * Create Kalshi SDK configuration
 * Supports both file path and PEM string for private key
 */
export function createKalshiConfig(): Configuration {
  const apiKey = process.env.KALSHI_API_KEY;
  const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY_PEM;
  const basePath =
    process.env.KALSHI_BASE_PATH ||
    "https://api.elections.kalshi.com/trade-api/v2";

  if (!apiKey) {
    throw new Error("KALSHI_API_KEY environment variable is required");
  }

  if (!privateKeyPath && !privateKeyPem) {
    throw new Error(
      "Either KALSHI_PRIVATE_KEY_PATH or KALSHI_PRIVATE_KEY_PEM environment variable is required"
    );
  }

  // Create configuration with either file path or PEM string
  const config: any = {
    apiKey,
    basePath,
  };

  if (privateKeyPath) {
    config.privateKeyPath = privateKeyPath;
  } else if (privateKeyPem) {
    config.privateKeyPem = privateKeyPem;
  }

  return new Configuration(config);
}
