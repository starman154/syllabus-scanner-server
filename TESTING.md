# Testing Guide for Syllabus Scanner Server

## 🚀 Quick Start Testing

### 1. Browser Testing (Recommended)
1. **Start the simple test server**: `node test-server-simple.js`
2. **Open test.html** in your browser: `open test.html`
3. **Upload any image** to test the interface (returns mock data)

### 2. Command Line Testing with curl

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test file upload (with a real image file)
curl -X POST \
  -F "syllabus=@/path/to/your/image.jpg" \
  http://localhost:3000/api/scan-syllabus

# Test file upload with sample text file (simulate image)
curl -X POST \
  -F "syllabus=@sample-syllabus.txt" \
  http://localhost:3000/api/scan-syllabus
```

### 3. Production Server Setup

To test with real OCR and AI processing:

1. **Get API Keys**:
   - OpenAI API key from https://platform.openai.com/
   - Google Cloud Vision API credentials

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start Production Server**:
   ```bash
   npm start
   ```

## 🧪 Test Files Available

- **test.html** - Interactive web interface for testing
- **test-server-simple.js** - Test server that returns mock data (no API keys needed)
- **sample-syllabus.txt** - Sample syllabus text for testing

## 📊 Expected Response Format

```json
{
  "success": true,
  "data": {
    "course_name": "Computer Science 101: Introduction to Programming",
    "professor_name": "Dr. Sarah Johnson",
    "professor_email": "sarah.johnson@university.edu",
    "meeting_days": "Monday, Wednesday, Friday",
    "test_dates": ["March 15, 2024", "May 10, 2024"],
    "assignment_deadlines": ["February 5, 2024", "February 19, 2024"],
    "weekly_readings": ["Chapter 1-2 (Introduction)", "Chapter 3-4 (Variables)"]
  },
  "extracted_text_length": 1234
}
```

## 🔧 Troubleshooting

### Common Issues:

1. **Server won't start**:
   - Check if port 3000 is in use: `lsof -i :3000`
   - Kill existing process: `pkill -f node`

2. **Missing API keys**:
   - Use `test-server-simple.js` for testing without API keys
   - Configure `.env` file for production testing

3. **CORS errors**:
   - Server includes CORS support
   - Make sure you're testing from the same domain or localhost

4. **File upload fails**:
   - Check file size (10MB limit)
   - Ensure file type is supported (JPEG, PNG, PDF)

## 🎯 Testing Scenarios

### Basic Functionality:
- [x] Health endpoint responds
- [x] File upload accepts images
- [x] CORS headers present
- [x] Error handling works

### Production Features (requires API keys):
- [ ] OCR text extraction from images
- [ ] AI parsing of syllabus content
- [ ] Structured JSON response
- [ ] File cleanup after processing

## 🌐 Browser Testing Steps

1. Open `test.html` in your browser
2. Server status should show "✅ Server Online"
3. Drag & drop or select an image file
4. Click "📤 Scan Syllabus"
5. View results in the response area

Perfect for quick testing without setting up API keys!