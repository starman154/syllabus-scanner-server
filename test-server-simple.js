const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'syllabus-scanner-server'
  });
});

app.post('/api/scan-syllabus', (req, res) => {
  res.json({
    success: true,
    message: 'Server is working! Configure API keys to enable full functionality.',
    data: {
      course_name: "Test Course",
      professor_name: "Test Professor",
      professor_email: "test@example.com",
      meeting_days: "Monday, Wednesday, Friday",
      test_dates: ["2024-03-15", "2024-05-10"],
      assignment_deadlines: ["2024-02-05", "2024-02-19"],
      weekly_readings: ["Chapter 1-2", "Chapter 3-4"]
    }
  });
});

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});

module.exports = app;