import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Verify CDP credentials
if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  console.error("\nError: CDP API credentials not found in .env file.");
  console.error("\nPlease add the following to your .env file:");
  console.error("CDP_API_KEY_ID=your-api-key-id");
  console.error("CDP_API_KEY_SECRET=your-api-key-secret");
  console.error("\nGet your credentials from: https://portal.cdp.coinbase.com/\n");
  process.exit(1);
}

try {
  // Configure Coinbase SDK with your API credentials
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID,
    privateKey: process.env.CDP_API_KEY_SECRET,
  });

  console.log("\n🔑 Creating x402 seller wallet...\n");

  // Create a new wallet on base-sepolia (testnet)
  const wallet = await Wallet.create({ networkId: "base-sepolia" });
  
  // Get the default address
  const address = await wallet.getDefaultAddress();
  
  console.log("✅ Seller wallet created successfully!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Wallet ID: ${wallet.getId()}`);
  console.log(`Address: ${address.getId()}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  // Export wallet data for backup
  const walletData = wallet.export();
  
  console.log("📝 Update your .env file with:\n");
  console.log(`X402_SELLER_PAYTO=${address.getId()}`);
  console.log(`X402_SELLER_WALLET_ID=${wallet.getId()}\n`);
  
  // Save wallet data to a file for backup (KEEP THIS SECURE!)
  const backupFile = `seller-wallet-${wallet.getId()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(walletData, null, 2));
  
  console.log(`💾 Wallet backup saved to: ${backupFile}`);
  console.log("⚠️  IMPORTANT: Keep this file secure - it contains your wallet's private keys!\n");
  
} catch (error) {
  console.error("\n❌ Error creating wallet:", error.message);
  console.error("\nFull error:", error);
  process.exit(1);
}
