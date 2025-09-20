// Simple script to get Railway's outbound IP
const https = require('https');

function getPublicIP() {
    return new Promise((resolve, reject) => {
        const req = https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('🌐 Railway Outbound IP:', data);
                resolve(data);
            });
        });

        req.on('error', (err) => {
            console.error('❌ Error getting IP:', err.message);
            reject(err);
        });

        req.setTimeout(10000, () => {
            console.error('❌ Timeout getting IP');
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

getPublicIP().catch(console.error);