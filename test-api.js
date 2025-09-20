// Test script to verify the API works with text content
const fs = require('fs');

const testText = fs.readFileSync('./test-syllabus.txt', 'utf8');

console.log('Testing API with sample syllabus text...');
console.log('Text length:', testText.length);

// We'll simulate what pdf-parse would extract
const testAnalyzeTextFunction = async () => {
    try {
        const response = await fetch('https://syllabus-scanner-server.vercel.app/api/scan-syllabus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: testText,
                test: true
            })
        });

        const result = await response.json();
        console.log('API Response:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ PDF processing simulation successful!');
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

// For Node.js, we need to import fetch
const { fetch } = require('undici') || globalThis.fetch || require('node-fetch');

testAnalyzeTextFunction();