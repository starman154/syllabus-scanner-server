const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class SQLiteDatabase {
    constructor() {
        this.db = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const dbPath = path.join(__dirname, 'syllabus_scanner.db');
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error('❌ SQLite connection failed:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            const createCourses = `
                CREATE TABLE IF NOT EXISTS courses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    course_name TEXT,
                    professor_name TEXT,
                    professor_email TEXT,
                    meeting_days TEXT,
                    office_hours TEXT,
                    syllabus_text TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createAssignments = `
                CREATE TABLE IF NOT EXISTS assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    course_id INTEGER,
                    title TEXT,
                    due_date DATE,
                    due_time TIME,
                    type TEXT DEFAULT 'other',
                    description TEXT,
                    completed BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
                )
            `;

            this.db.serialize(() => {
                this.db.run(createCourses);
                this.db.run(createAssignments, (err) => {
                    if (err) {
                        console.error('❌ Failed to create tables:', err.message);
                        reject(err);
                    } else {
                        console.log('✅ Database tables created/verified');
                        resolve();
                    }
                });
            });
        });
    }

    async saveCourse(courseData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO courses (user_id, course_name, professor_name, professor_email, meeting_days, office_hours, syllabus_text)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(sql, [
                courseData.user_id || 'anonymous',
                courseData.course_name,
                courseData.professor_name,
                courseData.professor_email,
                courseData.meeting_days,
                courseData.office_hours,
                courseData.syllabus_text
            ], function(err) {
                if (err) {
                    console.error('❌ Failed to save course:', err.message);
                    reject(err);
                } else {
                    const courseId = this.lastID;
                    console.log(`✅ Course saved with ID: ${courseId}`);
                    resolve(courseId);
                }
            });
        });
    }

    async saveAssignment(courseId, assignmentData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO assignments (course_id, title, due_date, due_time, type, description)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            this.db.run(sql, [
                courseId,
                assignmentData.title,
                assignmentData.due_date,
                assignmentData.due_time,
                assignmentData.type,
                assignmentData.description
            ], function(err) {
                if (err) {
                    console.error('❌ Failed to save assignment:', err.message);
                    reject(err);
                } else {
                    console.log(`✅ Assignment saved: ${assignmentData.title}`);
                    resolve(this.lastID);
                }
            });
        });
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
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM courses WHERE user_id = ? ORDER BY created_at DESC`;
            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    console.error('❌ Failed to get courses:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getAssignmentsByCourse(courseId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC`;
            this.db.all(sql, [courseId], (err, rows) => {
                if (err) {
                    console.error('❌ Failed to get assignments:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err.message);
                    } else {
                        console.log('🔌 Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new SQLiteDatabase();