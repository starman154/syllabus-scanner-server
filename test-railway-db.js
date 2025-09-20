// Test script to verify Railway can connect to MySQL
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testRailwayDB() {
    console.log('🔍 Testing Railway MySQL connection...\n');

    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: {
            rejectUnauthorized: false
        },
        connectTimeout: 20000
    };

    console.log('Connection config:');
    console.log(`Host: ${config.host}`);
    console.log(`Port: ${config.port}`);
    console.log(`User: ${config.user}`);
    console.log(`Database: ${config.database}`);
    console.log(`Password: ${config.password ? '[SET]' : '[NOT SET]'}\n`);

    try {
        console.log('Attempting MySQL connection...');
        const connection = await mysql.createConnection(config);
        console.log('✅ MySQL connection successful!');

        // Test basic query
        const [rows] = await connection.execute('SHOW TABLES');
        console.log(`✅ Found ${rows.length} tables:`);
        rows.forEach(row => {
            const tableName = Object.values(row)[0];
            console.log(`  - ${tableName}`);
        });

        // Test course count
        try {
            const [courseRows] = await connection.execute('SELECT COUNT(*) as count FROM courses');
            console.log(`✅ Found ${courseRows[0].count} courses in database`);
        } catch (err) {
            console.log('⚠️ No courses table found or empty');
        }

        await connection.end();
        console.log('✅ Connection closed properly');

    } catch (error) {
        console.log('❌ MySQL connection failed:', error.message);
        console.log('❌ Error details:', {
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState
        });
    }
}

testRailwayDB();