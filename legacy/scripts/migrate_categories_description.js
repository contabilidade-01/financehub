import { db } from './server/db.js';
import postgres from 'postgres';

// Function to add description field to categories table
async function addDescricaoToCategoriesTable() {
  console.log('Adding descricao field to categorias table...');
  
  try {
    // Check if the column already exists
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'categorias' AND column_name = 'descricao';
    `;
    
    const columnExists = await db.execute(checkColumnQuery);
    
    if (columnExists.length === 0) {
      // Add the column if it doesn't exist
      const addColumnQuery = `
        ALTER TABLE categorias 
        ADD COLUMN descricao TEXT;
      `;
      
      await db.execute(addColumnQuery);
      console.log('Successfully added descricao field to categorias table');
    } else {
      console.log('descricao field already exists in categorias table');
    }
    
  } catch (error) {
    console.error('Error adding descricao field to categorias table:', error);
  }
}

// Run the migration
addDescricaoToCategoriesTable()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });