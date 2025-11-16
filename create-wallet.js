import { CdpClient } from "@coinbase/cdp-sdk";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  console.error("\nError: CDP API credentials not found in .env file.");
  console.error("\nPlease add the following to your .env file:");
  console.error("CDP_API_KEY_ID=your-api-key-id");
  console.error("CDP_API_KEY_SECRET=your-api-key-secret");
  console.error("CDP_WALLET_SECRET=your-wallet-secret");
  console.error("\nGet your credentials from: https://portal.cdp.coinbase.com/\n");
  process.exit(1);
}

if (!process.env.CDP_WALLET_SECRET) {
  console.error("\nError: CDP_WALLET_SECRET not found in .env file.");
  console.error("\nPlease add CDP_WALLET_SECRET to your .env file.");
  console.error("Get it from: https://portal.cdp.coinbase.com/\n");
  process.exit(1);
}

const cdp = new CdpClient();
const account = await cdp.evm.createAccount();

console.log(`\n✅ Account created successfully!`);
console.log(`Address: ${account.address}`);
console.log(`Name: ${account.name || 'Unnamed'}`);
console.log(`\nAdd this to your .env file:`);
console.log(`CDP_WALLET_ADDRESS=${account.address}`);
console.log(`CDP_WALLET_NAME=${account.name || 'Unnamed'}`);
console.log();
