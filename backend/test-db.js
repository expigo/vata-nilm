import { testConnection, categorizeDevice } from './src/db.js';

console.log('Testing database service...\n');

// Test connection
await testConnection();

// Test categorization
console.log('\n📋 Testing device categorization:');
console.log('tmk_wg_STRAAG_KROL1_45 →', categorizeDevice('tmk_wg_STRAAG_KROL1_45'));
console.log('siemonska_deye →', categorizeDevice('siemonska_deye'));
console.log('tmk_wg_STRAAG_MOSIR_lodowisko →', categorizeDevice('tmk_wg_STRAAG_MOSIR_lodowisko'));
console.log('unknown_device →', categorizeDevice('unknown_device'));

console.log('\n✅ Database service test complete!');
process.exit(0);
