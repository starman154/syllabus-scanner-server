#!/bin/bash

echo "🧪 Quick Syllabus Scanner Test"
echo "============================="

echo "1. Testing API Health..."
curl -s https://syllabus-scanner-server.vercel.app/health | jq .

echo -e "\n2. Testing File Validation..."
echo "Creating test file..."
echo "Computer Science 101 Test" > test-file.txt

echo "Uploading (should be rejected)..."
curl -s -X POST -F "syllabus=@test-file.txt" \
  https://syllabus-scanner-server.vercel.app/api/scan-syllabus | jq .

echo -e "\n3. Testing Environment..."
curl -s https://syllabus-scanner-server.vercel.app/debug/env | jq .

rm test-file.txt
echo -e "\n✅ Test complete! Try uploading a real PDF at:"
echo "   https://syllabus-scanner-server.vercel.app"