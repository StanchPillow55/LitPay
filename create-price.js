require('dotenv').config();
const https = require('https');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY not found in .env');
  process.exit(1);
}

function makeStripeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const response = JSON.parse(body);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(response);
        } else {
          reject(new Error(`Stripe API Error: ${response.error?.message || body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

function encodeFormData(obj) {
  return Object.keys(obj)
    .map(key => {
      const value = obj[key];
      if (typeof value === 'object' && value !== null) {
        return Object.keys(value)
          .map(subKey => `${encodeURIComponent(key)}[${encodeURIComponent(subKey)}]=${encodeURIComponent(value[subKey])}`)
          .join('&');
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
}

async function createMeterPrice() {
  console.log('Creating Stripe meter-based price...\n');

  // Step 1: Create or get a product
  console.log('Step 1: Creating product...');
  const product = await makeStripeRequest('POST', '/v1/products', encodeFormData({
    name: 'LitPay Usage',
    description: 'Pay-as-you-go usage for LitPay enrichment services'
  }));
  console.log(`✓ Product created: ${product.id}\n`);

  // Step 2: Create a billing meter
  console.log('Step 2: Creating billing meter...');
  const meter = await makeStripeRequest('POST', '/v1/billing/meters', encodeFormData({
    display_name: 'LitPay Enrichment Calls',
    event_name: 'enrichment_call',
    default_aggregation: { formula: 'sum' },
    'value_settings[event_payload_key]': 'amount_cents'
  }));
  console.log(`✓ Meter created: ${meter.id}\n`);

  // Step 3: Create a price linked to the meter
  console.log('Step 3: Creating meter price...');
  const price = await makeStripeRequest('POST', '/v1/prices', encodeFormData({
    currency: 'usd',
    product: product.id,
    'recurring[interval]': 'month',
    'recurring[usage_type]': 'metered',
    'recurring[meter]': meter.id,
    unit_amount: 100, // $1.00 per unit (you can adjust this)
    nickname: 'LitPay Usage - $1.00 per enrichment'
  }));
  console.log(`✓ Price created: ${price.id}\n`);

  console.log('='.repeat(60));
  console.log('SUCCESS! Add this to your .env file:');
  console.log('='.repeat(60));
  console.log(`METER_PRICE_ID=${price.id}`);
  console.log(`STRIPE_METER_ID=${meter.id}`);
  console.log(`STRIPE_PRODUCT_ID=${product.id}`);
  console.log('='.repeat(60));

  return { price, meter, product };
}

createMeterPrice()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
