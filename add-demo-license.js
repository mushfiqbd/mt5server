import Database from './database.js';

const db = new Database();

async function addDemoLicense() {
  try {
    await db.connect();
    await db.init();
    
    // Demo license details
    const licenseKey = 'DEMO-KEY-12345678';
    const userEmail = 'demo@silverpro.network';
    const expiryDate = Math.floor(new Date('2025-12-31').getTime() / 1000); // End of 2025
    
    // Check if license already exists
    const existing = await db.getLicense(licenseKey);
    
    if (existing) {
      console.log('✅ Demo license already exists:', licenseKey);
      console.log('   User:', existing.user_email);
      console.log('   Status:', existing.status);
      console.log('   Expiry:', new Date(existing.expiry_date * 1000).toISOString());
    } else {
      // Create new license
      await db.createLicense(licenseKey, userEmail, expiryDate);
      console.log('✅ Demo license created successfully!');
      console.log('   License Key:', licenseKey);
      console.log('   User:', userEmail);
      console.log('   Expiry:', new Date(expiryDate * 1000).toISOString());
    }
    
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addDemoLicense();

