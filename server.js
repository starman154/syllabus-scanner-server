const express = require('express');
const multer = require('multer');
const cors = require('cors');
const dotenv = require('dotenv');
const winston = require('winston');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const pdfParse = require('pdf-parse');
const database = require('./database');
const sqliteDatabase = require('./database-sqlite');

// Syllabus processing functions
async function analyzeSyllabusWithOpenAI(filePath) {
  logger.info(`Reading file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  let data;

  try {
    logger.info(`Attempting to parse PDF...`);
    data = await pdfParse(fileBuffer);
    logger.info(`Successfully extracted ${data.text.length} characters from PDF`);

    if (data.text.length === 0) {
      throw new Error('PDF parsing resulted in empty text. The PDF might be image-based or password-protected.');
    }
  } catch (pdfError) {
    logger.error(`PDF parsing failed:`, pdfError.message);
    throw new Error(`Failed to process PDF. Please try uploading an image (JPG/PNG) of your syllabus instead.`);
  }

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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'syllabus-scanner' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000, // 25 second timeout to fit within Vercel's 30s limit
  maxRetries: 1,  // Reduce retries to save time
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

async function analyzeTextWithOpenAI(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that extracts structured data from syllabi. Analyze the text and return the information in clean, readable plain text format."
      },
      {
        role: "user",
        content: `You are a COMPREHENSIVE syllabus analyzer trained to extract ALL student-essential information. Use this TRAINING EXAMPLE to understand what students need:

TRAINING EXAMPLE - ANT 141 Syllabus shows students need:
✓ Basic Info: "Introduction to Archaeology", "Professor C. R. DeCorse", "crdecorse@maxwell.syr.edu", "Mondays & Wednesdays 12:45-1:40", "2-5:00 Mon., Wed.; 12-2:00 Fri."
✓ Test Dates: "Monday, September 29", "Monday, November 3", "Tuesday, December 16, 10:15 AM - 12:15 PM"
✓ Assignment Deadlines: "Discussion section participation 40%", "Quizzes, exercises, film study guides"
✓ Weekly Readings: "Record of the Past: An Introduction to Archaeology, 4th Edition", "Chapter 1", "Chapters 2 & 3"
✓ Major Deliverables: "Two in-class exams (20% each)", "Final exam (20%)", "Discussion section grade (40%)"
✓ Important Dates: "Labor Day September 1 (no class)", "Fall Break October 14-15", "Thanksgiving November 23-30"

SPECIFIC ASSIGNMENT PATTERNS TO WATCH FOR:
• "In Class Writing Assignment" + dates: "Monday, Sept. 9", "Wednesday, Sept. 18"
• "ICWA" assignments with specific deadlines
• Homework assignments with due dates
• Project milestones and final deadlines
• Reading assignments by week/date
• Quiz and exam schedules
• Discussion posts and participation requirements

EXTRACT FROM THIS SYLLABUS TEXT:

${text}

RETURN IN THIS CLEAN FORMAT:
Course: [Course Name and Number]
Professor: [Name]
Email: [Email]
Meeting Times: [Days and times]
Office Hours: [Times]

Important Dates:
- [Date]: [Event description]
- [Date]: [Event description]

Assignments & Due Dates:
- [Date]: [Assignment name and details]
- [Date]: [Assignment name and details]

Tests & Exams:
- [Date]: [Test/exam details]
- [Date]: [Test/exam details]

Reading Schedule:
- Week/Date: [Reading assignment]
- Week/Date: [Reading assignment]

Additional Information:
[Any other important student information like grading, policies, etc.]`
      }
    ],
    temperature: 0.2,
    max_tokens: 2000
  });

  return completion.choices[0].message.content;
}

async function analyzePageWithOpenAI(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that extracts structured data from syllabi. Analyze the image and return the information in clean, readable plain text format."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a COMPREHENSIVE syllabus analyzer trained to extract ALL student-essential information. Use this TRAINING EXAMPLE to understand what students need:

TRAINING EXAMPLE - ANT 141 Syllabus shows students need:
✓ Basic Info: "Introduction to Archaeology", "Professor C. R. DeCorse", "crdecorse@maxwell.syr.edu", "Mondays & Wednesdays 12:45-1:40", "2-5:00 Mon., Wed.; 12-2:00 Fri."
✓ Test Dates: "Monday, September 29", "Monday, November 3", "Tuesday, December 16, 10:15 AM - 12:15 PM"
✓ Assignment Deadlines: "Discussion section participation 40%", "Quizzes, exercises, film study guides"
✓ Weekly Readings: "Record of the Past: An Introduction to Archaeology, 4th Edition", "Chapter 1", "Chapters 2 & 3"
✓ Major Deliverables: "Two in-class exams (20% each)", "Final exam (20%)", "Discussion section grade (40%)"
✓ Important Dates: "Labor Day September 1 (no class)", "Fall Break October 14-15", "Thanksgiving November 23-30"

SPECIFIC ASSIGNMENT PATTERNS TO WATCH FOR:
• "In Class Writing Assignment" + dates: "Monday, Sept. 9", "Wednesday, Sept. 18"
• "ICWA" assignments with specific deadlines
• "Mini-Exam" dates: "Monday, October 20", "Monday, November 10"
• Assignment percentages: "10% of final grade", "20% each"
• Submission details: "due at beginning of class", "submitted electronically"

EXTRACTION RULES - Find EVERY instance of:

BASIC CONTACT INFO:
• Course title/name/number
• Professor/instructor name(s) and contact info
• Class meeting schedule (days/times/location)
• Office hours and availability

ACADEMIC DEADLINES (CRITICAL for students):
• Exam dates (midterm, final, quizzes) with specific dates/times
• Assignment due dates and descriptions
• Project deadlines and submission requirements
• Discussion section requirements and participation grades

COURSE STRUCTURE:
• Required textbooks and reading assignments
• Weekly reading schedules and chapter assignments
• Major projects, presentations, papers
• Grading breakdown (percentages for exams, assignments, participation)

CALENDAR INFORMATION:
• Holiday breaks and no-class days
• Important semester dates and deadlines
• Special events, field trips, extra credit opportunities
• Final exam schedule and location

SEARCH FOR THESE PATTERNS:
- Specific dates: "September 29", "Monday, November 3", "December 16"
- Percentage breakdowns: "20% each", "40% of grade"
- Chapter assignments: "Chapter 1", "pages 101-114"
- Schedule patterns: "Week 1:", "Monday & Wednesday"
- Break periods: "Labor Day", "Fall Break", "Thanksgiving"
- Exam information: "Final exam", "in-class examination"

VALIDATION REQUIREMENT:
Return "Not specified in document" only if information truly doesn't exist after thorough search.

Return information in this clean, well-separated format:

🎓 COURSE INFORMATION
• Course Name: [course name or "Not specified in document"]
• Professor: [professor name or "Not specified in document"]
• Email: [email or "Not specified in document"]
• Meeting Days: [schedule or "Not specified in document"]
• Office Hours: [office hours or "Not specified in document"]

📝 TEST DATES
• [Each test date as a bullet point, or "Not specified in document"]

📋 ASSIGNMENT DEADLINES
• [Each assignment deadline as a bullet point, or "Not specified in document"]

📚 WEEKLY READINGS
• [Each reading assignment as a bullet point, or "Not specified in document"]

🎯 MAJOR DELIVERABLES
• [Each major project/deliverable as a bullet point, or "Not specified in document"]

📅 IMPORTANT DATES
• [Each important date as a bullet point, or "Not specified in document"]

EXTRACT EVERYTHING. STUDENTS DEPEND ON THIS INFORMATION.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 1000,
  });

  const content = completion.choices[0].message.content.trim();
  logger.info('OpenAI response:', content.substring(0, 200) + '...');

  // Return the plain text content directly
  return { plain_text: content };
}

function combineResults(page1Data, page3Data) {
  // Legacy function for backward compatibility - will use combineAllResults instead
  const allPageData = [
    { pageNumber: 1, data: page1Data },
    { pageNumber: 3, data: page3Data }
  ];
  return combineAllResults(allPageData);
}

function combineAllResults(allPageData) {
  // Smart combination - extract key information from all pages into one clean summary
  let courseInfo = { name: "", professor: "", email: "", meetingDays: "", officeHours: "" };
  let testDates = [];
  let assignmentDeadlines = [];
  let weeklyReadings = [];
  let majorDeliverables = [];
  let importantDates = [];

  // Helper function to extract bullet points from a section
  function extractBulletPoints(content, sectionTitle) {
    const sectionRegex = new RegExp(`${sectionTitle}\\s*\\n([\\s\\S]*?)(?=\\n\\s*[🎓📝📋📚🎯📅]|$)`, 'i');
    const sectionMatch = content.match(sectionRegex);

    if (sectionMatch) {
      const sectionContent = sectionMatch[1];
      // Extract bullet points that aren't just "Not specified in document"
      const bullets = sectionContent.match(/•\s*([^\n]+)/g) || [];
      return bullets
        .map(bullet => bullet.replace(/^•\s*/, '').trim())
        .filter(bullet =>
          bullet &&
          !bullet.includes('Not specified in document') &&
          !bullet.includes('TEST DATES') &&
          !bullet.includes('ASSIGNMENT DEADLINE') &&
          bullet.length > 5
        );
    }
    return [];
  }

  // Extract unique information from all pages
  allPageData.forEach(({ pageNumber, data }) => {
    const content = data.plain_text;

    // Extract course info (usually on page 1)
    if (content.includes('Course Name:') && !courseInfo.name) {
      const match = content.match(/Course Name: ([^\n•]+)/);
      if (match && !match[1].includes('Not specified')) courseInfo.name = match[1].trim();
    }
    if (content.includes('Professor:') && !courseInfo.professor) {
      const match = content.match(/Professor: ([^\n•]+)/);
      if (match && !match[1].includes('Not specified')) courseInfo.professor = match[1].trim();
    }
    if (content.includes('Email:') && !courseInfo.email) {
      const match = content.match(/Email: ([^\n•]+)/);
      if (match && !match[1].includes('Not specified')) courseInfo.email = match[1].trim();
    }
    if (content.includes('Meeting Days:') && !courseInfo.meetingDays) {
      const match = content.match(/Meeting Days: ([^\n•]+)/);
      if (match && !match[1].includes('Not specified')) courseInfo.meetingDays = match[1].trim();
    }
    if (content.includes('Office Hours:') && !courseInfo.officeHours) {
      const match = content.match(/Office Hours: ([^\n•]+)/);
      if (match && !match[1].includes('Not specified')) courseInfo.officeHours = match[1].trim();
    }

    // Extract structured data from OpenAI response sections
    const newTestDates = extractBulletPoints(content, 'TEST DATES');
    const newAssignments = extractBulletPoints(content, 'ASSIGNMENT DEADLINES');
    const newReadings = extractBulletPoints(content, 'WEEKLY READINGS');
    const newDeliverables = extractBulletPoints(content, 'MAJOR DELIVERABLES');
    const newImportantDates = extractBulletPoints(content, 'IMPORTANT DATES');

    // Add unique items only
    newTestDates.forEach(item => {
      if (!testDates.includes(item)) testDates.push(item);
    });
    newAssignments.forEach(item => {
      if (!assignmentDeadlines.includes(item)) assignmentDeadlines.push(item);
    });
    newReadings.forEach(item => {
      if (!weeklyReadings.includes(item)) weeklyReadings.push(item);
    });
    newDeliverables.forEach(item => {
      if (!majorDeliverables.includes(item)) majorDeliverables.push(item);
    });
    newImportantDates.forEach(item => {
      if (!importantDates.includes(item)) importantDates.push(item);
    });
  });

  // Create clean, concise summary
  const combinedText = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 SYLLABUS SUMMARY

🎓 COURSE INFORMATION
• Course: ${courseInfo.name || 'Not specified'}
• Professor: ${courseInfo.professor || 'Not specified'}
• Email: ${courseInfo.email || 'Not specified'}
• Meeting Days: ${courseInfo.meetingDays || 'Not specified'}
• Office Hours: ${courseInfo.officeHours || 'Not specified'}

📝 EXAM DATES
${testDates.length > 0 ? testDates.map(test => `• ${test}`).join('\n') : '• Not specified in document'}

📋 ASSIGNMENT DEADLINES
${assignmentDeadlines.length > 0 ? assignmentDeadlines.map(assignment => `• ${assignment}`).join('\n') : '• Not specified in document'}

📅 IMPORTANT DATES
${importantDates.length > 0 ? [...new Set(importantDates)].map(date => `• ${date}`).join('\n') : '• Not specified in document'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return { plain_text: combinedText };
}

async function analyzeSyllabusWithOpenAI(imagePath) {
  // Check if it's a PDF and convert to image first
  const fileExtension = path.extname(imagePath).toLowerCase();
  let processedImagePath = imagePath;

  try {
    logger.info(`Analyzing syllabus with OpenAI Vision: ${imagePath}`);

    if (fileExtension === '.pdf') {
      logger.info('Converting PDF to image...');

      // Convert PDF to image using system pdftocairo
      const outputDir = path.dirname(imagePath);
      const outputFile = path.join(outputDir, `converted-${Date.now()}.jpg`);

      try {
        // Extract text from PDF using pdf-parse (serverless-compatible)
        const dataBuffer = fs.readFileSync(imagePath);
        const pdfData = await pdfParse(dataBuffer);

        logger.info(`PDF text extracted: ${pdfData.text.length} characters`);

        // Analyze the extracted text directly with OpenAI
        const result = await analyzeTextWithOpenAI(pdfData.text);

        // Clean up and return result
        try {
          fs.unlinkSync(imagePath);
        } catch (cleanupError) {
          logger.error('Error deleting PDF file:', cleanupError);
        }

        return result;

        // PDF text extraction complete - result already returned above
      } catch (pdfError) {
        logger.error('Error processing PDF:', pdfError);
        throw new Error('Failed to process PDF. Please try uploading an image (JPG/PNG) of your syllabus instead.');
      }
    }

    // Single page analysis (fallback or single-page documents)
    const result = await analyzePageWithOpenAI(processedImagePath);

    // Clean up converted PDF image if it was created
    if (fileExtension === '.pdf' && processedImagePath !== imagePath) {
      fs.unlink(processedImagePath, (err) => {
        if (err) logger.error('Error deleting converted PDF image:', err);
      });
    }

    return result;
  } catch (error) {
    logger.error('Error analyzing syllabus with OpenAI:', error);

    // Clean up converted PDF image if it was created
    if (fileExtension === '.pdf' && processedImagePath !== imagePath) {
      fs.unlink(processedImagePath, (err) => {
        if (err) logger.error('Error deleting converted PDF image on error:', err);
      });
    }

    throw new Error(`Failed to analyze syllabus: ${error.message}`);
  }
}

// Helper function to parse syllabus data and extract assignments
function parseSyllabusData(aiResponse) {
  const courseData = {
    course_name: extractField(aiResponse, 'Course Name') || 'Unknown Course',
    professor_name: extractField(aiResponse, 'Professor Name') || 'Unknown Professor',
    professor_email: extractField(aiResponse, 'Professor Email') || '',
    meeting_days: extractField(aiResponse, 'Meeting Days') || '',
    office_hours: extractField(aiResponse, 'Office Hours') || '',
    syllabus_text: aiResponse
  };

  const assignments = extractAssignments(aiResponse);

  return { courseData, assignments };
}

function extractField(text, fieldName) {
  const patterns = [
    new RegExp(`${fieldName}[:\s]*([^\n•]+)`, 'i'),
    new RegExp(`📚\\s*${fieldName}[:\s]*([^\n•]+)`, 'i'),
    new RegExp(`🎓\\s*${fieldName}[:\s]*([^\n•]+)`, 'i')
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/^•\s*/, '');
    }
  }
  return null;
}

function extractAssignments(text) {
  const assignments = [];
  const sections = ['TEST DATES', 'ASSIGNMENT DEADLINE', 'Important Dates', 'EXAMS', 'ASSIGNMENTS'];

  for (const section of sections) {
    const sectionRegex = new RegExp(`${section}[\\s\\S]*?(?=\\n\\s*[🎓📝📋📚🎯📅]|$)`, 'i');
    const sectionMatch = text.match(sectionRegex);

    if (sectionMatch) {
      const bullets = sectionMatch[0].match(/•\s*([^\n]+)/g) || [];

      for (const bullet of bullets) {
        const cleanBullet = bullet.replace(/^•\s*/, '').trim();
        if (cleanBullet && !cleanBullet.includes('Not specified in document')) {
          const assignment = parseAssignmentBullet(cleanBullet, section);
          if (assignment) {
            assignments.push(assignment);
          }
        }
      }
    }
  }

  return assignments;
}

function parseAssignmentBullet(bullet, section) {
  // Look for dates in various formats
  const datePatterns = [
    /(\w+\s+\d{1,2},?\s+\d{4})/i,  // March 15, 2024
    /(\d{1,2}\/\d{1,2}\/\d{4})/,   // 3/15/2024
    /(\d{1,2}-\d{1,2}-\d{4})/,     // 3-15-2024
    /(\w+\s+\d{1,2})/i             // March 15
  ];

  let dueDate = null;
  let title = bullet;

  for (const pattern of datePatterns) {
    const match = bullet.match(pattern);
    if (match) {
      try {
        dueDate = new Date(match[1]).toISOString().split('T')[0]; // YYYY-MM-DD format
        title = bullet.replace(match[1], '').replace(/[:-]/g, '').trim();
        break;
      } catch (e) {
        // Invalid date, continue
      }
    }
  }

  // Determine assignment type
  let type = 'other';
  if (section.toLowerCase().includes('test') || section.toLowerCase().includes('exam') ||
      bullet.toLowerCase().includes('exam') || bullet.toLowerCase().includes('test')) {
    type = 'exam';
  } else if (bullet.toLowerCase().includes('assignment') || bullet.toLowerCase().includes('homework')) {
    type = 'assignment';
  } else if (bullet.toLowerCase().includes('reading')) {
    type = 'reading';
  } else if (bullet.toLowerCase().includes('project')) {
    type = 'project';
  } else if (bullet.toLowerCase().includes('quiz')) {
    type = 'quiz';
  }

  return {
    title: title || bullet,
    due_date: dueDate,
    due_time: null,
    type: type,
    description: bullet
  };
}


app.post('/api/scan-syllabus', upload.single('syllabus'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a syllabus image or PDF file'
      });
    }

    const userId = req.headers['user-id'] || 'anonymous';
    logger.info(`Processing syllabus file: ${req.file.filename}`);

    // Process the syllabus immediately
    try {
      // Check database connection
      if (!activeDatabase) {
        throw new Error('Database connection unavailable');
      }

      // Analyze the PDF with OpenAI
      const aiResponse = await analyzeSyllabusWithOpenAI(req.file.path);

      // Parse the AI response to extract structured data
      const { courseData, assignments } = parseSyllabusData(aiResponse);

      // Add user_id to course data
      courseData.user_id = userId;

      // Save course and assignments to database
      const courseId = await activeDatabase.saveCourse(courseData);
      logger.info(`Course saved with ID: ${courseId}`);

      let savedAssignments = [];
      if (assignments.length > 0) {
        savedAssignments = await activeDatabase.saveMultipleAssignments(courseId, assignments);
        logger.info(`Saved ${savedAssignments.length} assignments`);
      }

      // Clean up uploaded file
      fs.unlink(req.file.path, (err) => {
        if (err) logger.error('Error deleting processed file:', err);
      });

      // Return success with extracted data
      res.json({
        success: true,
        message: 'Syllabus processed successfully!',
        course: {
          id: courseId,
          name: courseData.course_name,
          professor: courseData.professor_name,
          email: courseData.professor_email
        },
        assignments: assignments.length,
        assignments_saved: savedAssignments.length
      });

    } catch (processingError) {
      logger.error('Syllabus processing failed:', processingError);

      // Clean up uploaded file on error
      fs.unlink(req.file.path, (err) => {
        if (err) logger.error('Error deleting uploaded file on error:', err);
      });

      throw processingError;
    }

  } catch (error) {
    logger.error('Error creating job:', error);
    logger.error('Error stack:', error.stack);
    logger.error('File info:', req.file ? {
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) logger.error('Error deleting uploaded file on error:', err);
      });
    }

    res.status(500).json({
      error: 'Job creation failed',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Job status check endpoint
app.get('/api/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        error: 'Missing job ID',
        message: 'Please provide a valid job ID'
      });
    }

    logger.info(`Checking status for job: ${jobId}`);

    // Get job from database
    if (!activeDatabase) {
      return res.status(500).json({
        error: 'Database unavailable',
        message: 'Cannot check job status - database connection failed'
      });
    }

    const job = await activeDatabase.getJobById(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: 'No job found with the provided ID'
      });
    }

    // Parse result data if it exists
    let resultData = null;
    if (job.result_data) {
      try {
        resultData = JSON.parse(job.result_data);
      } catch (parseError) {
        logger.error('Error parsing job result data:', parseError);
        resultData = job.result_data;
      }
    }

    res.json({
      success: true,
      job_id: job.id,
      status: job.status,
      created_at: job.created_at,
      updated_at: job.updated_at,
      completed_at: job.completed_at,
      file_name: job.file_name,
      error_message: job.error_message,
      data: resultData,
      course_id: job.course_id
    });

  } catch (error) {
    logger.error('Error checking job status:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Root route - serve the web interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'syllabus-scanner-server'
  });
});

// Debug endpoint for checking environment
app.get('/debug-env', (req, res) => {
  res.json({
    openai_key_set: !!process.env.OPENAI_API_KEY,
    openai_key_length: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    db_host_set: !!process.env.DB_HOST,
    db_name: process.env.DB_NAME,
    node_env: process.env.NODE_ENV
  });
});

app.get('/get-ip', async (req, res) => {
  try {
    const https = require('https');
    const response = await new Promise((resolve, reject) => {
      const req = https.get('https://api.ipify.org', (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });

    res.json({
      ip: response,
      timestamp: new Date().toISOString(),
      service: 'syllabus-scanner-server'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get IP',
      message: error.message
    });
  }
});

app.get('/test-mysql', async (req, res) => {
  try {
    logger.info('Testing MySQL connection from Railway...');

    await database.connect();
    logger.info('✅ MySQL connection successful from Railway');

    // Test basic query
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: false
      },
      connectTimeout: 20000
    });

    const [rows] = await connection.execute('SHOW TABLES');
    const tableCount = rows.length;

    const [courseRows] = await connection.execute('SELECT COUNT(*) as count FROM courses');
    const courseCount = courseRows[0].count;

    await connection.end();
    await database.close();

    res.json({
      status: 'success',
      message: 'MySQL connection successful from Railway',
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      tables: tableCount,
      courses: courseCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ MySQL connection failed from Railway:', error);

    res.status(500).json({
      status: 'error',
      message: 'MySQL connection failed',
      error: error.message,
      code: error.code,
      errno: error.errno,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint to check environment variables
app.get('/debug/env', (req, res) => {
  res.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openAIKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT
  });
});

// Diagnostic endpoint to test system components
app.get('/debug/system', async (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    pdftocairo: null,
    poppler: null,
    openai: null,
    filesystem: null
  };

  try {
    // Test pdftocairo command
    try {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec('pdftocairo -v', (error, stdout, stderr) => {
          if (error) {
            diagnostics.pdftocairo = { available: false, error: error.message };
          } else {
            diagnostics.pdftocairo = { available: true, version: stderr || stdout };
          }
          resolve();
        });
      });
    } catch (error) {
      diagnostics.pdftocairo = { available: false, error: error.message };
    }

    // Test OpenAI API
    try {
      if (process.env.OPENAI_API_KEY) {
        const OpenAI = require('openai');
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 60000,
          maxRetries: 3
        });

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Test message' }],
          max_tokens: 5
        });

        diagnostics.openai = {
          available: true,
          keyValid: true,
          response: response.choices[0].message.content
        };
      } else {
        diagnostics.openai = { available: false, error: 'No API key' };
      }
    } catch (error) {
      diagnostics.openai = { available: false, error: error.message };
    }

    // Test filesystem write permissions
    try {
      const fs = require('fs');
      const testFile = '/tmp/test-write.txt';
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      diagnostics.filesystem = { writable: true };
    } catch (error) {
      diagnostics.filesystem = { writable: false, error: error.message };
    }

    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({
      error: 'Diagnostic failed',
      message: error.message,
      diagnostics
    });
  }
});

app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
  }

  res.status(500).json({
    error: 'Internal server error',
    message: error.message || 'An unexpected error occurred'
  });
});

// Initialize database and start server
let activeDatabase = null;

async function startServer() {
  try {
    await database.connect();
    activeDatabase = database;
    console.log(`✅ Database connected to AWS RDS MySQL`);
  } catch (error) {
    logger.error('MySQL connection failed, trying SQLite fallback:', error.message);
    console.log(`⚠️ MySQL failed, connecting to SQLite...`);

    try {
      await sqliteDatabase.connect();
      activeDatabase = sqliteDatabase;
      console.log(`✅ Database connected to SQLite`);
    } catch (sqliteError) {
      logger.error('SQLite connection also failed:', sqliteError.message);
      console.log(`❌ All database connections failed`);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Syllabus Scanner Server running on port ${PORT}`);
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`External access: http://[YOUR_VPS_IP]:${PORT}`);
  });
}

startServer();

module.exports = app;