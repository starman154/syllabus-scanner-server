const fs = require('fs');
const winston = require('winston');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const database = require('./database');
require('dotenv').config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'syllabus-worker' },
  transports: [
    new winston.transports.File({ filename: 'worker.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000,
  maxRetries: 1,
});

async function analyzeSyllabusWithOpenAI(filePath) {
  logger.info(`Reading file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(fileBuffer);

  logger.info(`Extracted ${data.text.length} characters from PDF`);

  const prompt = `Please analyze this syllabus text and extract key information in a structured format. Return a JSON object with the following structure:

{
  "course_name": "Course title",
  "professor_name": "Professor name",
  "professor_email": "Professor email",
  "meeting_days": "Days and times when class meets",
  "office_hours": "Professor's office hours",
  "assignments": [
    {
      "title": "Assignment name",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM:SS",
      "type": "exam|assignment|reading|project|quiz|other",
      "description": "Assignment description"
    }
  ],
  "plain_text": "Clean, formatted version of the syllabus text"
}

Syllabus text:
${data.text}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (parseError) {
    logger.error('Failed to parse OpenAI response as JSON:', parseError);
    return {
      plain_text: content,
      error: 'Failed to parse structured data',
      raw_response: content
    };
  }
}

function parseSyllabusData(aiResponse) {
  const courseData = {
    course_name: aiResponse.course_name || 'Unknown Course',
    professor_name: aiResponse.professor_name || 'Unknown Professor',
    professor_email: aiResponse.professor_email || null,
    meeting_days: aiResponse.meeting_days || null,
    office_hours: aiResponse.office_hours || null,
    syllabus_text: aiResponse.plain_text || JSON.stringify(aiResponse)
  };

  const assignments = Array.isArray(aiResponse.assignments) ? aiResponse.assignments : [];

  return { courseData, assignments };
}

async function processJob(job) {
  logger.info(`Processing job ${job.id}: ${job.file_name}`);

  try {
    // Update job status to processing
    await database.updateJobStatus(job.id, 'processing');

    // Analyze the PDF
    const aiResponse = await analyzeSyllabusWithOpenAI(job.file_path);

    // Parse the AI response to extract structured data
    const { courseData, assignments } = parseSyllabusData(aiResponse);

    // Save course and assignments to database
    let courseId = null;
    let savedAssignments = [];

    try {
      // Save course information
      courseId = await database.saveCourse(courseData);
      logger.info(`Course saved with ID: ${courseId}`);

      // Save assignments
      if (assignments.length > 0) {
        savedAssignments = await database.saveMultipleAssignments(courseId, assignments);
        logger.info(`Saved ${savedAssignments.length} assignments`);
      }
    } catch (dbError) {
      logger.error('Database save error:', dbError);
      // Continue with job completion even if DB save fails
    }

    // Prepare result data
    const resultData = {
      ...aiResponse,
      course_id: courseId,
      assignments_saved: savedAssignments.length
    };

    // Update job with results
    await database.updateJobResult(job.id, resultData, courseId);

    // Clean up uploaded file
    try {
      fs.unlinkSync(job.file_path);
      logger.info(`Cleaned up file: ${job.file_path}`);
    } catch (cleanupError) {
      logger.error('Error cleaning up file:', cleanupError);
    }

    logger.info(`Job ${job.id} completed successfully`);

  } catch (error) {
    logger.error(`Job ${job.id} failed:`, error);

    // Update job with error
    await database.updateJobError(job.id, error.message);

    // Clean up uploaded file on error
    try {
      if (fs.existsSync(job.file_path)) {
        fs.unlinkSync(job.file_path);
        logger.info(`Cleaned up file after error: ${job.file_path}`);
      }
    } catch (cleanupError) {
      logger.error('Error cleaning up file after error:', cleanupError);
    }
  }
}

async function runWorker() {
  logger.info('🚀 Background worker started');

  // Connect to database
  try {
    await database.connect();
    logger.info('✅ Worker connected to database');
  } catch (error) {
    logger.error('❌ Worker failed to connect to database:', error);
    process.exit(1);
  }

  // Main worker loop
  while (true) {
    try {
      // Get pending jobs
      const pendingJobs = await database.getPendingJobs(5);

      if (pendingJobs.length > 0) {
        logger.info(`Found ${pendingJobs.length} pending jobs`);

        // Process jobs one by one
        for (const job of pendingJobs) {
          await processJob(job);
        }
      } else {
        // No pending jobs, wait before checking again
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      }

    } catch (error) {
      logger.error('Worker loop error:', error);
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds on error
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('📤 Shutting down worker...');
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('📤 Shutting down worker...');
  await database.close();
  process.exit(0);
});

// Start the worker
if (require.main === module) {
  runWorker().catch(error => {
    logger.error('❌ Worker startup failed:', error);
    process.exit(1);
  });
}

module.exports = { runWorker, processJob };