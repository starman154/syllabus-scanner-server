const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    },
    connectTimeout: 20000
};

class Database {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection(dbConfig);
            console.log('✅ Connected to AWS RDS MySQL database');
            await this.createTables();
            return this.connection;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async createTables() {
        try {
            await this.connection.execute(`
                CREATE TABLE IF NOT EXISTS courses (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(255),
                    course_name VARCHAR(255),
                    professor_name VARCHAR(255),
                    professor_email VARCHAR(255),
                    meeting_days VARCHAR(255),
                    office_hours TEXT,
                    syllabus_text LONGTEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id)
                )
            `);

            await this.connection.execute(`
                CREATE TABLE IF NOT EXISTS assignments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    course_id INT,
                    title VARCHAR(500),
                    due_date DATE,
                    due_time TIME,
                    type ENUM('exam', 'assignment', 'reading', 'project', 'quiz', 'other') DEFAULT 'other',
                    description TEXT,
                    completed BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                    INDEX idx_course_id (course_id),
                    INDEX idx_due_date (due_date)
                )
            `);

            console.log('✅ Database tables created/verified');
        } catch (error) {
            console.error('❌ Failed to create tables:', error.message);
            throw error;
        }
    }

    async saveCourse(courseData) {
        try {
            const [result] = await this.connection.execute(`
                INSERT INTO courses (user_id, course_name, professor_name, professor_email, meeting_days, office_hours, syllabus_text)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                courseData.user_id || 'anonymous',
                courseData.course_name,
                courseData.professor_name,
                courseData.professor_email,
                courseData.meeting_days,
                courseData.office_hours,
                courseData.syllabus_text
            ]);

            const courseId = result.insertId;
            console.log(`✅ Course saved with ID: ${courseId}`);
            return courseId;
        } catch (error) {
            console.error('❌ Failed to save course:', error.message);
            throw error;
        }
    }

    async saveAssignment(courseId, assignmentData) {
        try {
            const [result] = await this.connection.execute(`
                INSERT INTO assignments (course_id, title, due_date, due_time, type, description)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                courseId,
                assignmentData.title,
                assignmentData.due_date,
                assignmentData.due_time,
                assignmentData.type,
                assignmentData.description
            ]);

            console.log(`✅ Assignment saved: ${assignmentData.title}`);
            return result.insertId;
        } catch (error) {
            console.error('❌ Failed to save assignment:', error.message);
            throw error;
        }
    }

    async saveMultipleAssignments(courseId, assignments) {
        const savedAssignments = [];
        for (const assignment of assignments) {
            try {
                const assignmentId = await this.saveAssignment(courseId, assignment);
                savedAssignments.push(assignmentId);
            } catch (error) {
                console.error(`Failed to save assignment: ${assignment.title}`, error.message);
            }
        }
        return savedAssignments;
    }

    async getCoursesByUser(userId) {
        try {
            const [rows] = await this.connection.execute(`
                SELECT * FROM courses WHERE user_id = ? ORDER BY created_at DESC
            `, [userId]);
            return rows;
        } catch (error) {
            console.error('❌ Failed to get courses:', error.message);
            throw error;
        }
    }

    async getAssignmentsByCourse(courseId) {
        try {
            const [rows] = await this.connection.execute(`
                SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC
            `, [courseId]);
            return rows;
        } catch (error) {
            console.error('❌ Failed to get assignments:', error.message);
            throw error;
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

module.exports = new Database();