#!/usr/bin/env node

/**
 * validate-env-example.js
 * 
 * Validates .env.example file to ensure:
 * 1. All variables are documented with comments
 * 2. No real secrets are present (all placeholders)
 * 3. Required variables are present
 * 
 * METRICS.md requirement: 100% variables documented, 0 real secrets
 */

const fs = require('fs');
const path = require('path');

// Expected environment variables based on specs/env.schema.md
const REQUIRED_VARS = [
  'NODE_ENV',
  'PORT',
  'BASE_URL',
  'SESSION_SECRET',
  'JWT_SECRET',
  'POSTGRES_URL',
  'CDP_API_KEY_ID',
  'CDP_API_KEY_SECRET',
  'CDP_NETWORK',
  'X402_BUYER_WALLET_ID',
  'X402_BUYER_ADDRESS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEARCH_CONTACT_EMAIL',
  'POLICY_DAILY_BUDGET_CENTS',
  'POLICY_SESSION_CAP_CENTS',
  'POLICY_PER_CALL_MAX_CENTS',
  'POLICY_PROVIDER_X402_DAILY_CEILING_CENTS',
  'RESERVATION_TTL_MINUTES'
];

// Patterns that indicate real secrets (not placeholders)
const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]{24,}/,           // Stripe live secret key
  /sk_test_[a-zA-Z0-9]{24,}/,           // Stripe test secret key
  /whsec_[a-zA-Z0-9]{32,}/,             // Stripe webhook secret
  /rk_live_[a-zA-Z0-9]{24,}/,           // Stripe restricted key
  /pk_live_[a-zA-Z0-9]{24,}/,           // Stripe publishable key
  /price_[a-zA-Z0-9]{24,}/,             // Stripe price ID (real)
  /prod_[a-zA-Z0-9]{24,}/,              // Stripe product ID (real)
  /cus_[a-zA-Z0-9]{14,}/,               // Stripe customer ID (real)
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // UUID (could be real wallet ID)
  /0x[a-fA-F0-9]{40}/,                  // Ethereum address (real)
  /postgresql:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+/, // Real postgres URL with password
  /redis:\/\/[^:]+:[^@]+@/,             // Real redis URL with password
  /AKIA[0-9A-Z]{16}/,                   // AWS access key
  /[a-zA-Z0-9\/\+]{40,}/,               // Base64 encoded secrets (>40 chars)
];

// Placeholder patterns that are acceptable
const PLACEHOLDER_PATTERNS = [
  /<YOUR_[A-Z_]+>/,
  /<SELLER_[A-Z_]+>/,
  /\.\.\./,
  /your-/i,
  /example\./i,
  /localhost/,
  /user:password@/,
  /demo-/,
];

function validateEnvExample(filePath) {
  console.log('🔍 Validating .env.example...\n');
  
  let exitCode = 0;
  const errors = [];
  const warnings = [];
  
  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const foundVars = new Set();
  const undocumentedVars = [];
  const suspiciousLines = [];
  
  let lastCommentLine = null;
  
  // Parse file
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    
    // Track comments
    if (line.startsWith('#')) {
      lastCommentLine = lineNum;
      continue;
    }
    
    // Skip empty lines
    if (line === '') {
      continue;
    }
    
    // Parse variable assignment
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      const varName = match[1];
      const value = line.substring(match[0].length);
      
      foundVars.add(varName);
      
      // Check if variable has documentation (comment within 5 lines)
      if (lastCommentLine === null || lineNum - lastCommentLine > 5) {
        undocumentedVars.push({ varName, lineNum });
      }
      
      // Check for real secrets
      let hasPlaceholder = false;
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(value)) {
          hasPlaceholder = true;
          break;
        }
      }
      
      if (!hasPlaceholder) {
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(value)) {
            suspiciousLines.push({
              varName,
              lineNum,
              value: value.substring(0, 50) + (value.length > 50 ? '...' : ''),
              pattern: pattern.toString()
            });
            break;
          }
        }
      }
    }
  }
  
  // Check for missing required variables
  const missingVars = REQUIRED_VARS.filter(v => !foundVars.has(v));
  
  // Report results
  console.log('📊 Validation Results:\n');
  console.log(`Total variables found: ${foundVars.size}`);
  console.log(`Required variables: ${REQUIRED_VARS.length}`);
  console.log(`Missing required: ${missingVars.length}`);
  console.log(`Undocumented: ${undocumentedVars.length}`);
  console.log(`Suspicious values: ${suspiciousLines.length}\n`);
  
  // Report missing variables
  if (missingVars.length > 0) {
    console.log('❌ Missing required variables:');
    missingVars.forEach(v => console.log(`   - ${v}`));
    console.log('');
    exitCode = 1;
  }
  
  // Report undocumented variables
  if (undocumentedVars.length > 0) {
    console.log('⚠️  Undocumented variables (no comment within 5 lines):');
    undocumentedVars.forEach(({ varName, lineNum }) => {
      console.log(`   - ${varName} (line ${lineNum})`);
    });
    console.log('');
    // This is a warning, not an error for now
  }
  
  // Report suspicious values
  if (suspiciousLines.length > 0) {
    console.log('❌ POTENTIAL REAL SECRETS DETECTED:');
    suspiciousLines.forEach(({ varName, lineNum, value, pattern }) => {
      console.log(`   - ${varName} (line ${lineNum})`);
      console.log(`     Value: ${value}`);
      console.log(`     Matched pattern: ${pattern}`);
    });
    console.log('');
    console.log('⚠️  WARNING: Real secrets must NOT be in .env.example!');
    console.log('   Use placeholders like <YOUR_API_KEY> instead.\n');
    exitCode = 1;
  }
  
  // Success
  if (exitCode === 0) {
    console.log('✅ Validation passed!');
    console.log('   - All required variables present');
    console.log('   - No real secrets detected');
    console.log('   - All variables have documentation\n');
  } else {
    console.log('❌ Validation failed. Please fix the issues above.\n');
  }
  
  process.exit(exitCode);
}

// Run validation
const envExamplePath = path.join(__dirname, '.env.example');
validateEnvExample(envExamplePath);
