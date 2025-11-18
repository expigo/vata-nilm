#!/usr/bin/env node

/**
 * Create Initial Users Script
 * Creates KROL and MOSIR users in the database
 *
 * Usage: node scripts/create-users.js
 */

import { createUser } from '../backend/src/auth.js';
import pool from '../backend/src/db.js';

async function createInitialUsers() {
  console.log('🚀 Creating initial users...\n');

  try {
    // Create KROL user
    console.log('Creating KROL user...');
    try {
      const krolUser = await createUser({
        username: 'krol',
        email: 'krol@vata-nilm.local',
        password: 'krol123', // CHANGE THIS IN PRODUCTION!
        role: 'manager',
        siteAccess: 'KROL',
        fullName: 'KROL Manager',
        company: 'KROL',
        createdBy: null
      });

      console.log('✅ KROL user created successfully:');
      console.log(`   ID: ${krolUser.id}`);
      console.log(`   Username: ${krolUser.username}`);
      console.log(`   Email: ${krolUser.email}`);
      console.log(`   Role: ${krolUser.role}`);
      console.log(`   Site Access: ${krolUser.site_access}`);
      console.log('');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️  KROL user already exists, skipping...\n');
      } else {
        throw error;
      }
    }

    // Create MOSIR user
    console.log('Creating MOSIR user...');
    try {
      const mosirUser = await createUser({
        username: 'mosir',
        email: 'mosir@vata-nilm.local',
        password: 'mosir123', // CHANGE THIS IN PRODUCTION!
        role: 'manager',
        siteAccess: 'MOSIR',
        fullName: 'MOSIR Manager',
        company: 'MOSIR',
        createdBy: null
      });

      console.log('✅ MOSIR user created successfully:');
      console.log(`   ID: ${mosirUser.id}`);
      console.log(`   Username: ${mosirUser.username}`);
      console.log(`   Email: ${mosirUser.email}`);
      console.log(`   Role: ${mosirUser.role}`);
      console.log(`   Site Access: ${mosirUser.site_access}`);
      console.log('');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️  MOSIR user already exists, skipping...\n');
      } else {
        throw error;
      }
    }

    // Create admin user (if not exists)
    console.log('Creating admin user...');
    try {
      const adminUser = await createUser({
        username: 'admin',
        email: 'admin@vata-nilm.local',
        password: 'admin123', // CHANGE THIS IN PRODUCTION!
        role: 'admin',
        siteAccess: 'ALL',
        fullName: 'System Administrator',
        company: 'VATA NILM',
        createdBy: null
      });

      console.log('✅ Admin user created successfully:');
      console.log(`   ID: ${adminUser.id}`);
      console.log(`   Username: ${adminUser.username}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Role: ${adminUser.role}`);
      console.log(`   Site Access: ${adminUser.site_access}`);
      console.log('');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️  Admin user already exists, skipping...\n');
      } else {
        throw error;
      }
    }

    console.log('✅ All users created successfully!\n');
    console.log('📋 Login Credentials:');
    console.log('');
    console.log('   KROL User:');
    console.log('   Username: krol');
    console.log('   Password: krol123');
    console.log('   Access: KROL site only');
    console.log('');
    console.log('   MOSIR User:');
    console.log('   Username: mosir');
    console.log('   Password: mosir123');
    console.log('   Access: MOSIR site only');
    console.log('');
    console.log('   Admin User:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Access: All sites');
    console.log('');
    console.log('⚠️  IMPORTANT: Change these passwords immediately in production!');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating users:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run the script
createInitialUsers();
