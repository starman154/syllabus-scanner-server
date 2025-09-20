# Syllabus Scanner Server

A Node.js Express server that processes syllabus documents using OCR and AI to extract structured data.

## Features

- **Document Upload**: Accepts image uploads (JPEG, PNG) and PDFs
- **OCR Processing**: Uses Google Cloud Vision API for text extraction
- **AI Parsing**: Uses OpenAI GPT-3.5 to parse syllabus into structured JSON
- **CORS Support**: Ready for frontend integration
- **Error Handling**: Comprehensive error handling and logging
- **File Management**: Automatic cleanup of uploaded files

## API Response Format

The `/api/scan-syllabus` endpoint returns:

```json
{
  "success": true,
  "data": {
    "course_name": "Introduction to Computer Science",
    "professor_name": "Dr. Jane Smith",
    "professor_email": "jane.smith@university.edu",
    "meeting_days": "Monday, Wednesday, Friday",
    "test_dates": ["2024-03-15", "2024-04-20", "2024-05-25"],
    "assignment_deadlines": ["2024-03-01", "2024-03-15", "2024-04-01"],
    "weekly_readings": ["Chapter 1-2", "Chapter 3-4", "Chapter 5-6"]
  },
  "extracted_text_length": 1234
}
```

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

3. **Google Cloud Setup**:
   - Create a Google Cloud project
   - Enable the Vision API
   - Create a service account and download the JSON key file
   - Set `GOOGLE_CLOUD_KEY_FILE` to the path of your credentials file

4. **OpenAI Setup**:
   - Get your API key from OpenAI
   - Set `OPENAI_API_KEY` in your `.env` file

5. **Run the Server**:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

## API Endpoints

### POST `/api/scan-syllabus`
Upload and process a syllabus document.

**Request**: Multipart form data with `syllabus` file field
**Response**: Structured JSON data extracted from the syllabus

### GET `/health`
Health check endpoint.

## Error Handling

The server includes comprehensive error handling for:
- Invalid file types
- File size limits (10MB max)
- OCR processing failures
- AI parsing errors
- Missing API keys or credentials

## Logging

Logs are written to:
- `combined.log`: All logs
- `error.log`: Error logs only
- Console: Development logs

## Integration with TaskManagerApp

This server is designed to be integrated with your TaskManagerApp. The structured JSON response can be used to populate course schedules, assignment deadlines, and other calendar features in your app.