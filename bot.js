const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@adiwajshing/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.authPath = path.join(__dirname, '../.auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }
    }

    async initialize(clientsMap) {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            
            this.sock = makeWASocket({
                printQRInTerminal: false,
                auth: state,
                qrTimeout: 20000
            });

            // Bind event listeners
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    this.broadcastToClients(clientsMap, {
                        type: 'qr',
                        qr: qr
                    });
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect.error instanceof Boom && 
                        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
                    
                    this.broadcastToClients(clientsMap, {
                        type: 'connection',
                        status: 'Disconnected'
                    });

                    if (shouldReconnect) {
                        await this.initialize(clientsMap);
                    }
                } else if (connection === 'open') {
                    this.broadcastToClients(clientsMap, {
                        type: 'connection',
                        status: 'Connected'
                    });
                }
            });

            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('messages.upsert', async ({ messages }) => {
                const msg = messages[0];
                if (!msg.key.fromMe && msg.message) {
                    await this.handleMessage(msg);
                }
            });

            return this.sock;
        } catch (error) {
            console.error('Error initializing WhatsApp bot:', error);
            throw error;
        }
    }

    async handleMessage(msg) {
        try {
            const text = msg.message.conversation || 
                        msg.message.extendedTextMessage?.text || '';
            const sender = msg.key.remoteJid;
            
            if (text.startsWith('!') || text.startsWith('.') || text.startsWith('#')) {
                await this.handleCommand(sender, text.slice(1).toLowerCase());
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    async handleCommand(sender, command) {
        const args = command.split(' ');
        const cmd = args[0];
        
        try {
            switch (cmd) {
                case 'help':
                    await this.sendHelpMessage(sender);
                    break;
                case 'status':
                    await this.handleStatusCommand(sender, args);
                    break;
                // Add other commands here
                default:
                    await this.sock.sendMessage(sender, {
                        text: '❌ Perintah tidak dikenal. Ketik *help* untuk bantuan.'
                    });
            }
        } catch (error) {
            console.error(`Error handling command ${cmd}:`, error);
        }
    }

    async sendHelpMessage(sender) {
        const helpMessage = `───「 *Neon.ID* 」───╮
│ ${this.getFormattedDate()}
╰────────────────╯

*Menu Bantuan*
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄

📱 *Perintah Pelanggan:*
🔸 *status* - Cek status perangkat
🔸 *ssid2g* [nama] - Ubah nama WiFi 2.4G
🔸 *ssid5g* [nama] - Ubah nama WiFi 5G
🔸 *pass2g* [password] - Ubah password WiFi 2.4G
🔸 *pass5g* [password] - Ubah password WiFi 5G
🔸 *devices* - Lihat perangkat terhubung
🔸 *userinfo* - Lihat info pelanggan

> _Neon.ID_`;

        await this.sock.sendMessage(sender, { text: helpMessage });
    }

    getFormattedDate() {
        const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        
        const d = new Date();
        return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}
${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}`;
    }

    broadcastToClients(clientsMap, data) {
        for (const client of clientsMap.values()) {
            if (client.readyState === 1) {
                client.send(JSON.stringify(data));
            }
        }
    }

    async disconnect() {
        if (this.sock) {
            await this.sock.logout();
            await this.sock.end();
            this.sock = null;
        }
    }
}

module.exports = new WhatsAppBot();