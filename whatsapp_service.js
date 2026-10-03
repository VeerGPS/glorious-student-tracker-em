/**
 * WhatsApp Web Service via @whiskeysockets/baileys
 * Handles WhatsApp Web QR pairing, session persistence,
 * and automated direct PDF report card dispatching to parents.
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, 'whatsapp_auth');

let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let currentQrCode = null;
let currentQrDataUrl = null;
let connectedUser = null;
let isInitializing = false;

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

async function initWhatsApp(forceNew = false) {
  if (isInitializing) {
    return { status: connectionStatus, qr: currentQrDataUrl, user: connectedUser };
  }

  if (connectionStatus === 'connected' && sock && !forceNew) {
    return { status: connectionStatus, qr: null, user: connectedUser };
  }

  isInitializing = true;
  connectionStatus = 'connecting';
  currentQrCode = null;
  currentQrDataUrl = null;

  try {
    if (forceNew) {
      if (sock) {
        try { sock.end(); } catch (e) {}
        sock = null;
      }
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      syncFullHistory: false,
      browser: ['GPS Student Tracker (EM)', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQrCode = qr;
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        } catch (e) {
          console.error('Failed to generate QR data URL:', e.message);
        }
        connectionStatus = 'qr_ready';
        console.log('📱 WhatsApp QR code ready for scanning.');
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrCode = null;
        currentQrDataUrl = null;
        isInitializing = false;

        const id = sock.user?.id || '';
        const phone = id.split(':')[0] || id.split('@')[0];
        connectedUser = {
          id: id,
          phone: phone,
          name: sock.user?.name || 'Glorious Public School'
        };
        console.log(`✔ WhatsApp Web connected successfully! Linked Account: +${phone} (${connectedUser.name})`);
      }

      if (connection === 'close') {
        isInitializing = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`⚠ WhatsApp connection closed (code: ${statusCode}, loggedOut: ${isLoggedOut})`);

        connectedUser = null;
        currentQrCode = null;
        currentQrDataUrl = null;

        if (isLoggedOut) {
          connectionStatus = 'disconnected';
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (e) {}
          sock = null;
        } else {
          // Automatic reconnect on network interruption
          connectionStatus = 'connecting';
          setTimeout(() => {
            initWhatsApp(false).catch(err => {
              console.error('WhatsApp auto-reconnect failed:', err.message);
              connectionStatus = 'disconnected';
            });
          }, 3500);
        }
      }
    });

    return { status: connectionStatus, qr: currentQrDataUrl, user: connectedUser };
  } catch (err) {
    isInitializing = false;
    connectionStatus = 'disconnected';
    console.error('Failed to initialize WhatsApp socket:', err);
    throw err;
  }
}

async function disconnectWhatsApp() {
  try {
    if (sock) {
      try { await sock.logout(); } catch (e) {}
      try { sock.end(); } catch (e) {}
      sock = null;
    }
  } catch (err) {
    console.warn('Error during socket cleanup:', err.message);
  }

  connectionStatus = 'disconnected';
  currentQrCode = null;
  currentQrDataUrl = null;
  connectedUser = null;
  isInitializing = false;

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (e) {}

  return { success: true, message: 'WhatsApp session disconnected and cleared.' };
}

function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    qr: currentQrDataUrl,
    user: connectedUser
  };
}

async function sendStudentReportPDF({ mobile, roll, name, examTitle, pdfBase64, filename }) {
  if (connectionStatus !== 'connected' || !sock) {
    return {
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code to link your WhatsApp account.'
    };
  }

  if (!mobile) {
    return { success: false, error: 'Mobile number is required.' };
  }

  if (!pdfBase64) {
    return { success: false, error: 'PDF data is missing.' };
  }

  // Format mobile to JID (defaults to Indian 91 country code if 10 digits)
  let cleaned = String(mobile).replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = cleaned;

  let jid = `${cleaned}@s.whatsapp.net`;

  try {
    // Verify number is registered on WhatsApp
    try {
      const check = await sock.onWhatsApp(jid);
      if (check && check.length > 0) {
        if (check[0].exists) {
          jid = check[0].jid || jid;
        } else {
          return {
            success: false,
            error: `Mobile number +${cleaned} is not registered on WhatsApp.`
          };
        }
      }
    } catch (checkErr) {
      // Continue with standard JID if check call times out
    }

    const safeName = (name || 'Student').trim();
    const docFileName = filename || `Report_Card_${safeName.replace(/\s+/g, '_')}_Roll${roll || ''}.pdf`;
    
    // Official School Caption (strictly NO marks text breakdown & NO dashboard link)
    const caption = `*GLORIOUS PUBLIC SCHOOL*\n*Official Student Progress Report Card*\n\nStudent: *${safeName}*\nRoll No: ${roll || '-'}\nExam/Period: ${examTitle || 'Progress Assessment'}\n\n📄 *Official Marksheet PDF is attached above.*`;

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    await sock.sendMessage(jid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName: docFileName,
      caption: caption
    });

    return {
      success: true,
      message: `Report card PDF successfully dispatched to +${cleaned}`,
      mobile: cleaned,
      recipient: safeName
    };
  } catch (err) {
    console.error(`Error sending PDF to +${cleaned}:`, err.message);
    return {
      success: false,
      error: `Failed to dispatch: ${err.message || 'WhatsApp error'}`
    };
  }
}

// Auto-connect on startup if session credentials already exist
if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
  console.log('🔄 Found existing WhatsApp session credentials. Auto-connecting...');
  initWhatsApp(false).catch(err => {
    console.warn('Initial WhatsApp auto-connect deferred:', err.message);
  });
}

module.exports = {
  initWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendStudentReportPDF
};
