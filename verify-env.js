require('dotenv').config();

const requiredVars = {
  'Core': ['NODE_ENV', 'PORT', 'BASE_URL'],
  'Auth': ['SESSION_SECRET', 'JWT_SECRET'],
  'Stripe': ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'METER_PRICE_ID'],
  'CDP/x402': ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'X402_BUYER_ADDRESS', 'X402_SELLER_PAYTO'],
  'Database': ['POSTGRES_URL'],
  'Policy': ['POLICY_DAILY_BUDGET_CENTS', 'POLICY_SESSION_CAP_CENTS', 'POLICY_PER_CALL_MAX_CENTS']
};

const optionalVars = ['REDIS_URL', 'OBJECT_STORE_BUCKET', 'ANTHROPIC_API_KEY'];

console.log('🔍 LitPay Environment Verification\n');
console.log('='.repeat(50));

let allGood = true;
let warnings = [];

// Check required variables
for (const [category, vars] of Object.entries(requiredVars)) {
  console.log(`\n${category}:`);
  for (const varName of vars) {
    const value = process.env[varName];
    const isSet = value && !value.includes('<YOUR_');
    
    if (isSet) {
      // Mask sensitive values
      let display = value;
      if (varName.includes('SECRET') || varName.includes('KEY') || varName.includes('PRIVATE')) {
        display = value.substring(0, 15) + '...';
      } else if (varName.includes('URL') && value.includes(':')) {
        display = value.replace(/:[^:@]*@/, ':***@');
      }
      console.log(`  ✅ ${varName}: ${display}`);
    } else {
      console.log(`  ❌ ${varName}: NOT SET or placeholder`);
      allGood = false;
    }
  }
}

// Check optional variables
console.log(`\nOptional:`);
for (const varName of optionalVars) {
  const value = process.env[varName];
  const isSet = value && !value.includes('<YOUR_');
  if (isSet) {
    let display = value;
    if (varName.includes('KEY')) {
      display = value.substring(0, 15) + '...';
    }
    console.log(`  ✅ ${varName}: ${display}`);
  } else {
    console.log(`  ⚠️  ${varName}: NOT SET (optional)`);
    warnings.push(varName);
  }
}

console.log('\n' + '='.repeat(50));

if (allGood) {
  console.log('\n✅ All required environment variables are properly configured!');
  if (warnings.length > 0) {
    console.log(`\n⚠️  Optional variables not set: ${warnings.join(', ')}`);
    console.log('   These may be needed for full functionality.');
  }
} else {
  console.log('\n❌ Some required environment variables are missing or not configured.');
  console.log('   Please update your .env file with the correct values.');
  process.exit(1);
}

// Test Stripe initialization
console.log('\n🧪 Testing Stripe initialization...');
try {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('✅ Stripe SDK initialized successfully');
} catch (err) {
  console.log(`❌ Stripe SDK failed: ${err.message}`);
  allGood = false;
}

console.log('\n✨ Environment verification complete!\n');
