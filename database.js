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
    connectTimeout: 20000,
    acquireTimeout: 20000,
    timeout: 20000,
    reconnect: true
};

class Database {
    constructor() {
        this.pool = null;
    }

    async connect() {
        try {
            this.pool = mysql.createPool({
                ...dbConfig,
                waitForConnections: true,
                connectionLimit: 5,
                queueLimit: 0,
                idleTimeout: 60000,
                acquireTimeout: 20000
            });

            // Test the connection
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            console.log('✅ Connected to AWS RDS MySQL database with connection pool');
            await this.createTables();
            return this.pool;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async getConnection() {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }
        return await this.pool.getConnection();
    }

    async createTables() {
        try {
            await this.pool.execute(`
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

            await this.pool.execute(`
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

            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS jobs (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(255),
                    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
                    file_name VARCHAR(255),
                    file_path VARCHAR(500),
                    result_data LONGTEXT,
                    error_message TEXT,
                    course_id INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP NULL,
                    INDEX idx_user_id (user_id),
                    INDEX idx_status (status),
                    INDEX idx_created_at (created_at),
                    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
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

    async createJob(jobId, userId, fileName, filePath) {
        try {
            await this.pool.execute(`
                INSERT INTO jobs (id, user_id, file_name, file_path, status)
                VALUES (?, ?, ?, ?, 'pending')
            `, [jobId, userId || 'anonymous', fileName, filePath]);

            console.log(`✅ Job created with ID: ${jobId}`);
            return jobId;
        } catch (error) {
            console.error('❌ Failed to create job:', error.message);
            throw error;
        }
    }

    async updateJobStatus(jobId, status) {
        try {
            await this.pool.execute(`
                UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [status, jobId]);

            console.log(`✅ Job ${jobId} status updated to: ${status}`);
        } catch (error) {
            console.error('❌ Failed to update job status:', error.message);
            throw error;
        }
    }

    async getJobById(jobId) {
        try {
            const [rows] = await this.connection.execute(`
                SELECT * FROM jobs WHERE id = ?
            `, [jobId]);
            return rows[0] || null;
        } catch (error) {
            console.error('❌ Failed to get job:', error.message);
            throw error;
        }
    }

    async updateJobResult(jobId, resultData, courseId = null) {
        try {
            await this.pool.execute(`
                UPDATE jobs SET
                    status = 'completed',
                    result_data = ?,
                    course_id = ?,
                    completed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [JSON.stringify(resultData), courseId, jobId]);

            console.log(`✅ Job ${jobId} completed successfully`);
        } catch (error) {
            console.error('❌ Failed to update job result:', error.message);
            throw error;
        }
    }

    async updateJobError(jobId, errorMessage) {
        try {
            await this.pool.execute(`
                UPDATE jobs SET
                    status = 'failed',
                    error_message = ?,
                    completed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [errorMessage, jobId]);

            console.log(`❌ Job ${jobId} failed: ${errorMessage}`);
        } catch (error) {
            console.error('❌ Failed to update job error:', error.message);
            throw error;
        }
    }

    async getPendingJobs(limit = 10) {
        try {
            const [rows] = await this.connection.execute(`
                SELECT * FROM jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT ?
            `, [limit]);
            return rows;
        } catch (error) {
            console.error('❌ Failed to get pending jobs:', error.message);
            throw error;
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('🔌 Database connection pool closed');
        }
    }
}

module.exports = new Database();