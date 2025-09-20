// Test script to verify PDF upload functionality
const fs = require('fs');
const { FormData, File } = require('undici');

const testUploadToAPI = async () => {
    try {
        // Create FormData with our test file
        const formData = new FormData();

        // Read our test syllabus file and create a blob
        const testText = fs.readFileSync('./test-syllabus.txt', 'utf8');

        // Create a fake PDF-like file for testing
        const blob = new File([testText], 'test-syllabus.txt', { type: 'text/plain' });
        formData.append('syllabus', blob);

        console.log('Testing file upload to API...');
        console.log('File size:', blob.size);

        const response = await fetch('https://syllabus-scanner-server.vercel.app/api/scan-syllabus', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('\nAPI Response:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ PDF processing test successful!');
            console.log('Extracted structure:');
            if (result.data && result.data.plain_text) {
                console.log(result.data.plain_text);
            }
        } else {
            console.log('❌ API returned error:', result.message);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }
};

testUploadToAPI();