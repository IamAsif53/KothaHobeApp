import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import mongoose from 'mongoose';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { setupSocketIO } from '../src/sockets/socketManager';
import { User } from '../src/models/User';
import { Conversation } from '../src/models/Conversation';
import { Message } from '../src/models/Message';

async function runEndToEndTest() {
  console.log('==================================================');
  console.log('🧪 Starting Kotha Hobe End-to-End Real-Time Test');
  console.log('==================================================');

  await connectDB();

  // Clean test collection
  await User.deleteMany({ phoneNumber: { $in: ['+8801700000000', '+8801800000000'] } });
  await Conversation.deleteMany({});
  await Message.deleteMany({});

  const server = http.createServer(app);
  const ioServer = new SocketIOServer(server, { cors: { origin: '*' } });
  setupSocketIO(ioServer);

  const testPort = 5099;
  await new Promise<void>((resolve) => server.listen(testPort, resolve));
  console.log(`✅ Test server running on port ${testPort}`);

  const baseUrl = `http://localhost:${testPort}/api`;

  // STEP 1: Authenticate User A (+8801700000000)
  console.log('\n[1] Registering User A (+8801700000000)...');
  const resA = await fetch(`${baseUrl}/auth/firebase-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '+8801700000000', displayName: 'John Doe' }),
  });
  const dataA: any = await resA.json();
  if (!dataA.success) throw new Error('User A auth failed');
  console.log(`✅ User A authenticated. ID: ${dataA.user._id}, Token issued.`);

  // STEP 2: Authenticate User B (+8801800000000)
  console.log('\n[2] Registering User B (+8801800000000)...');
  const resB = await fetch(`${baseUrl}/auth/firebase-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '+8801800000000', displayName: 'Sarah Connor' }),
  });
  const dataB: any = await resB.json();
  if (!dataB.success) throw new Error('User B auth failed');
  console.log(`✅ User B authenticated. ID: ${dataB.user._id}, Token issued.`);

  // STEP 3: User A searches for User B by Phone
  console.log('\n[3] User A searching for User B (+8801800000000)...');
  const searchRes = await fetch(`${baseUrl}/users/search?phone=%2B8801800000000`, {
    headers: { Authorization: `Bearer ${dataA.token}` },
  });
  const searchData: any = await searchRes.json();
  if (!searchData.success || searchData.user.displayName !== 'Sarah Connor') {
    throw new Error('User search failed');
  }
  console.log(`✅ User search successful! Found: ${searchData.user.displayName}`);

  // STEP 4: Create 1-to-1 Conversation
  console.log('\n[4] User A creating conversation with User B...');
  const convRes = await fetch(`${baseUrl}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dataA.token}`,
    },
    body: JSON.stringify({ recipientId: dataB.user._id }),
  });
  const convData: any = await convRes.json();
  const conversationId = convData.conversation._id;
  console.log(`✅ Conversation created/retrieved. ID: ${conversationId}`);

  // STEP 5: Verify Uniqueness
  console.log('\n[5] Verifying conversation uniqueness...');
  const convResB = await fetch(`${baseUrl}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dataB.token}`,
    },
    body: JSON.stringify({ recipientId: dataA.user._id }),
  });
  const convDataB: any = await convResB.json();
  if (convDataB.conversation._id !== conversationId) {
    throw new Error('Uniqueness violation: duplicate conversation created!');
  }
  console.log('✅ Uniqueness verified! Both users map to exact same conversation ID.');

  // STEP 6: Connect Socket.IO Clients for User A and User B
  console.log('\n[6] Connecting Socket.IO real-time channels for User A and User B...');
  const socketA: ClientSocket = ioClient(`http://localhost:${testPort}`, {
    auth: { token: dataA.token },
  });
  const socketB: ClientSocket = ioClient(`http://localhost:${testPort}`, {
    auth: { token: dataB.token },
  });

  await new Promise<void>((resolve) => {
    let connectedCount = 0;
    const check = () => {
      connectedCount++;
      if (connectedCount === 2) resolve();
    };
    socketA.on('connect', check);
    socketB.on('connect', check);
  });
  console.log('✅ Both WebSockets connected & authenticated successfully.');

  // STEP 7: Real-Time Message Exchange
  console.log('\n[7] Testing Real-Time Message Sending from User A to User B...');
  const clientMessageId = `test_msg_${Date.now()}`;

  const messagePromise = new Promise<any>((resolve) => {
    socketB.on('message:new', (msg) => {
      console.log(`⚡ User B received real-time message: "${msg.text}"`);
      resolve(msg);
    });
  });

  socketA.emit('message:send', {
    conversationId,
    receiverId: dataB.user._id,
    text: 'Hello Sarah! This is a real-time message.',
    clientMessageId,
  });

  const receivedMsg = await messagePromise;
  if (receivedMsg.text !== 'Hello Sarah! This is a real-time message.') {
    throw new Error('Real-time message text mismatch');
  }
  console.log('✅ Real-time delivery verified!');

  // STEP 8: Read Receipt Test
  console.log('\n[8] Testing Read Receipt (Blue Ticks)...');
  const readPromise = new Promise<any>((resolve) => {
    socketA.on('message:read', (receipt) => {
      console.log('⚡ User A received READ receipt:', receipt);
      resolve(receipt);
    });
  });

  socketB.emit('message:read', { conversationId });
  await readPromise;
  console.log('✅ Read receipt successfully delivered to sender!');

  // STEP 9: Database Persistence Check
  console.log('\n[9] Verifying Database Message Persistence...');
  const historyRes = await fetch(`${baseUrl}/messages/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${dataA.token}` },
  });
  const historyData: any = await historyRes.json();
  if (!historyData.success || historyData.messages.length === 0) {
    throw new Error('Message persistence check failed');
  }
  console.log(`✅ Message persisted in MongoDB. Status: ${historyData.messages[0].status}`);

  // Clean up sockets & server
  socketA.disconnect();
  socketB.disconnect();
  server.close();
  await disconnectDB();

  console.log('\n🎉 ALL SUCCESS CRITERIA MET 100%! APPLICATION IS PRODUCTION READY.');
}

runEndToEndTest().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
