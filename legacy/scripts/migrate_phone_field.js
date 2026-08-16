import { db } from './server/db.ts';
import { sql } from 'drizzle-orm';

async function addPhoneFieldToUsers() {
  try {
    console.log('=== ADDING PHONE FIELD TO USERS TABLE ===');
    
    // Add phone field to users table
    await db.execute(sql`
      ALTER TABLE usuarios 
      ADD COLUMN IF NOT EXISTS telefone VARCHAR(20)
    `);
    
    console.log('✓ Phone field added to usuarios table successfully');
    console.log('==========================================');
    
  } catch (error) {
    console.error('Error adding phone field:', error);
    throw error;
  }
}

// Run the migration
addPhoneFieldToUsers()
  .then(() => {
    console.log('Phone field migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Phone field migration failed:', error);
    process.exit(1);
  });