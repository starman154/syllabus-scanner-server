const database = require('./database');
const sqliteDatabase = require('./database-sqlite');
require('dotenv').config();

async function testDatabases() {
    console.log('🔍 Testing database connections...\n');

    // Test MySQL connection
    console.log('Testing MySQL connection...');
    try {
        await database.connect();
        console.log('✅ MySQL connection successful');

        // Test basic MySQL operations
        const testCourse = {
            course_name: 'Test Course',
            professor_name: 'Test Professor',
            professor_email: 'test@test.com'
        };

        const courseId = await database.saveCourse(testCourse);
        console.log(`✅ MySQL save test successful - Course ID: ${courseId}`);

        await database.close();
        console.log('✅ MySQL connection closed properly\n');

    } catch (error) {
        console.log('❌ MySQL connection failed:', error.message);
        console.log('   This is expected if DB credentials are not set or incorrect\n');
    }

    // Test SQLite connection
    console.log('Testing SQLite connection...');
    try {
        await sqliteDatabase.connect();
        console.log('✅ SQLite connection successful');

        // Test basic SQLite operations
        const testCourse = {
            course_name: 'Test SQLite Course',
            professor_name: 'Test SQLite Professor',
            professor_email: 'sqlite@test.com'
        };

        const courseId = await sqliteDatabase.saveCourse(testCourse);
        console.log(`✅ SQLite save test successful - Course ID: ${courseId}`);

        await sqliteDatabase.close();
        console.log('✅ SQLite connection closed properly\n');

    } catch (error) {
        console.log('❌ SQLite connection failed:', error.message);
    }

    console.log('🔍 Database testing complete!');
}

testDatabases().catch(console.error);