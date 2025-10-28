import Database from './database.js';

const db = new Database();

async function addAllDemoLicenses() {
  try {
    await db.connect();
    await db.init();
    
    const licenses = [
      {
        key: 'DEMO-KEY-12345678',
        email: 'demo@silverpro.network',
        expiry: Math.floor(new Date('2025-12-31').getTime() / 1000)
      },
      {
        key: 'DEMO-KEY-87654321',
        email: 'demo2@silverpro.network',
        expiry: Math.floor(new Date('2025-12-31').getTime() / 1000)
      }
    ];
    
    for (const license of licenses) {
      const existing = await db.getLicense(license.key);
      
      if (existing) {
        console.log('✅ License already exists:', license.key);
      } else {
        await db.createLicense(license.key, license.email, license.expiry);
        console.log('✅ License created:', license.key);
      }
    }
    
    console.log('\n📋 All demo licenses:');
    for (const license of licenses) {
      const data = await db.getLicense(license.key);
      console.log(`   ${data.license_key} - ${data.user_email} - ${data.status}`);
    }
    
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addAllDemoLicenses();

