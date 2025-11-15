#!/usr/bin/env node
/**
 * Quick script to check if createdAt has a default value
 * Run with: node scripts/check-created-at-default.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDefault() {
  try {
    const result = await prisma.$queryRaw`
      SELECT column_name, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'deployments' AND column_name = 'createdAt';
    `;
    
    console.log('\n=== createdAt Column Info ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result && result.length > 0) {
      const columnDefault = result[0].column_default;
      if (columnDefault === null) {
        console.log('\n✅ SUCCESS: createdAt has NO default (as expected)');
      } else {
        console.log(`\n⚠️  WARNING: createdAt still has default: ${columnDefault}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDefault();

