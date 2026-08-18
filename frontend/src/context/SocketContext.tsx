import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { IMessage } from '../types';
import { registerPushTokenApi } from '../api/userApi';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

interface OutboxItem {
  conversationId: string;
  receiverId: string;
  text: string;
  clientMessageId: string;
  type?: string;
  attachment?: any;
  replyTo?: any;
  timestamp: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  sendMessage: (
    conversationId: string,
    receiverId: string,
    text: string,
    clientMessageId: string,
    type?: string,
    attachment?: any,
    replyTo?: any
  ) => void;
  flushPendingOutbox: () => void;
  markAsRead: (conversationId: string) => void;
  startTyping: (conversationId: string, receiverId: string) => void;
  stopTyping: (conversationId: string, receiverId: string) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  pushToken: string | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activeChatRef = useRef<string | null>(null);

  useEffect(() => {
    activeChatRef.current = activeConversationId;
  }, [activeConversationId]);

  // Complete FCM Push Notification Lifecycle on Native Android
  useEffect(() => {
    if (!token || !user || !Capacitor.isNativePlatform()) return;

    let isMounted = true;

    const initializeFCM = async () => {
      try {
        console.log('[Push] Initializing Push Notifications...');

        // 1. Create Android Notification Channels
        try {
          await PushNotifications.createChannel({
            id: 'chat_messages',
            name: 'Chat Messages',
            description: 'Incoming messages from Kotha Hobe',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
            lights: true,
          });
          await PushNotifications.createChannel({
            id: 'incoming_calls',
            name: 'Incoming Voice Calls',
            description: 'Incoming live calls from Kotha Hobe',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
            lights: true,
          });
          console.log('[Push] Notification channels "chat_messages" and "incoming_calls" created with HIGH importance');
        } catch (e) {
          console.warn('[Push] Channel creation note:', e);
        }

        // 2. Check and Request Permissions
        let permStatus = await PushNotifications.checkPermissions();
        console.log('[Push] Initial Permission status:', permStatus.receive);

        if (permStatus.receive !== 'granted') {
          console.log('[Push] Requesting notification permission...');
          permStatus = await PushNotifications.requestPermissions();
          console.log('[Push] Updated Permission status:', permStatus.receive);
        }

        if (permStatus.receive === 'granted') {
          // 3. Attach Listeners BEFORE Registering
          const regListener = await PushNotifications.addListener('registration', async (fcmToken) => {
            if (!isMounted) return;
            const tokenVal = fcmToken.value;
            const fingerprint = tokenVal.length > 8 ? `...${tokenVal.slice(-6)}` : tokenVal;
            console.log(`[Push] FCM Registration Successful! Token fingerprint: ${fingerprint}`);
            setPushToken(tokenVal);

            try {
              const res = await registerPushTokenApi(tokenVal);
              if (res.success) {
                console.log('[Push] Token registered successfully on backend database.');
              }
            } catch (err) {
              console.warn('[Push] Failed to register token with backend:', err);
            }
          });

          const regErrorListener = await PushNotifications.addListener('registrationError', (error) => {
            console.error('[Push] FCM Registration Error:', error);
          });

          const pushRecvListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[Push] Foreground push received:', notification.title, notification.body);
          });

          // 4. Register with FCM via Google Play Services
          console.log('[Push] Calling PushNotifications.register()...');
          await PushNotifications.register();

          return () => {
            regListener.remove();
            regErrorListener.remove();
            pushRecvListener.remove();
          };
        } else {
          console.warn('[Push] Notification permission denied by user.');
        }
      } catch (err) {
        console.error('[Push] FCM Initialization error:', err);
      }
    };

    const cleanupPromise = initializeFCM();

    return () => {
      isMounted = false;
      cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup();
      }).catch(() => {});
    };
  }, [token, user]);

  // Helper to get stored outbox
  const getStoredOutbox = (): OutboxItem[] => {
    try {
      const data = localStorage.getItem('kotha_hobe_outbox');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  // Helper to save outbox
  const saveOutbox = (items: OutboxItem[]) => {
    try {
      localStorage.setItem('kotha_hobe_outbox', JSON.stringify(items));
    } catch (err) {
      console.warn('[Outbox] Save error:', err);
    }
  };

  // Helper to remove acknowledged messages from outbox
  const removeSentFromOutbox = (clientMessageId?: string) => {
    if (!clientMessageId) return;
    const current = getStoredOutbox();
    const filtered = current.filter((item) => item.clientMessageId !== clientMessageId);
    if (filtered.length !== current.length) {
      saveOutbox(filtered);
    }
  };

  // Flush Outbox when socket or internet reconnects
  const flushOutbox = (targetSocket: Socket) => {
    const pending = getStoredOutbox();
    if (pending.length === 0) return;

    console.log(`[Outbox] ⚡ Flushing ${pending.length} pending offline message(s)...`);
    pending.forEach((item) => {
      targetSocket.emit('message:send', {
        conversationId: item.conversationId,
        receiverId: item.receiverId,
        text: item.text,
        clientMessageId: item.clientMessageId,
        type: item.type || 'text',
        attachment: item.attachment,
        replyTo: item.replyTo,
      });
    });
  };

  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (window.location.origin.includes('localhost') || window.location.origin.includes('file')
        ? 'https://kotha-hobe-api.onrender.com'
        : window.location.origin);

    const newSocket = io(socketUrl, {
      auth: { token },
      extraHeaders: {
        'Bypass-Tunnel-Reminder': 'true',
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected with ID:', newSocket.id);
      setIsConnected(true);
      setIsReconnecting(false);

      // Automatically flush any messages queued while offline!
      flushOutbox(newSocket);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('reconnect_attempt', () => {
      setIsReconnecting(true);
    });

    newSocket.on('reconnect', () => {
      setIsConnected(true);
      setIsReconnecting(false);
      flushOutbox(newSocket);
    });

    // Remove from Outbox when message is confirmed sent by server
    newSocket.on('message:sent', (sentMsg: IMessage) => {
      const outbox = getStoredOutbox();
      const filtered = outbox.filter((item) => item.clientMessageId !== sentMsg.clientMessageId);
      saveOutbox(filtered);
    });

    // Handle Local In-App Notification if user is on another screen inside app
    newSocket.on('message:new', async (newMsg: IMessage) => {
      try {
        if (activeChatRef.current === newMsg.conversationId) {
          return;
        }

        const soundPref = localStorage.getItem('kotha_hobe_sound_enabled') !== 'false';
        const previewPref = localStorage.getItem('kotha_hobe_preview_enabled') !== 'false';

        let senderName = 'New Message';
        try {
          const cachedConvs = localStorage.getItem('kotha_hobe_cached_conversations');
          if (cachedConvs) {
            const parsed = JSON.parse(cachedConvs);
            const conv = parsed.find((c: any) => c._id === newMsg.conversationId || c.recipient?._id === newMsg.senderId);
            if (conv?.recipient) {
              senderName = conv.recipient.displayName || conv.recipient.username || 'New Message';
            }
          }
        } catch {}
        const bodyText = previewPref ? newMsg.text : 'Sent you a new message';

        if (Capacitor.isNativePlatform()) {
          await LocalNotifications.schedule({
            notifications: [
              {
                title: senderName,
                body: bodyText,
                id: Math.floor(Math.random() * 1000000),
                schedule: { at: new Date(Date.now() + 50) },
                channelId: 'chat_messages',
                sound: soundPref ? 'default' : undefined,
                extra: {
                  conversationId: newMsg.conversationId,
                },
              },
            ],
          });
        }
      } catch (err) {
        console.warn('[Notifications] Trigger notice:', err);
      }
    });

    setSocket(newSocket);

    // Online Event Listener to flush immediately when internet reconnects
    const handleOnline = () => {
      console.log('[Network] Internet restored. Re-syncing socket...');
      if (newSocket.connected) {
        flushOutbox(newSocket);
      } else {
        newSocket.connect();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      newSocket.disconnect();
    };
  }, [token, user]);

  const sendMessage = (
    conversationId: string,
    receiverId: string,
    text: string,
    clientMessageId: string,
    type: string = 'text',
    attachment?: any,
    replyTo?: any
  ) => {
    const outbox = getStoredOutbox();
    if (!outbox.some((item) => item.clientMessageId === clientMessageId)) {
      outbox.push({
        conversationId,
        receiverId,
        text,
        clientMessageId,
        type,
        attachment,
        replyTo,
        timestamp: Date.now(),
      });
      saveOutbox(outbox);
    }

    if (socket && isConnected) {
      socket.emit('message:send', {
        conversationId,
        receiverId,
        text,
        clientMessageId,
        type,
        attachment,
        replyTo,
      });
    }
  };

  const flushPendingOutbox = () => {
    if (socket && isConnected) {
      flushOutbox(socket);
    }
  };

  const markAsRead = (conversationId: string) => {
    if (socket && isConnected && conversationId) {
      socket.emit('message:read', { conversationId });
    }
  };

  const startTyping = (conversationId: string, receiverId: string) => {
    if (socket && isConnected) {
      socket.emit('typing:start', { conversationId, receiverId });

      if (typingTimeoutRef.current[conversationId]) {
        clearTimeout(typingTimeoutRef.current[conversationId]);
      }
      typingTimeoutRef.current[conversationId] = setTimeout(() => {
        stopTyping(conversationId, receiverId);
      }, 3000);
    }
  };

  const stopTyping = (conversationId: string, receiverId: string) => {
    if (socket && isConnected) {
      socket.emit('typing:stop', { conversationId, receiverId });
      if (typingTimeoutRef.current[conversationId]) {
        clearTimeout(typingTimeoutRef.current[conversationId]);
        delete typingTimeoutRef.current[conversationId];
      }
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isReconnecting,
        sendMessage,
        flushPendingOutbox,
        markAsRead,
        startTyping,
        stopTyping,
        activeConversationId,
        setActiveConversationId,
        pushToken,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};
