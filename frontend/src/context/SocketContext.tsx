import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { IMessage } from '../types';
import { registerPushTokenApi } from '../api/userApi';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

interface OutboxItem {
  conversationId: string;
  receiverId?: string;
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
  reconnectNow: () => void;
  sendMessage: (
    conversationId: string,
    receiverId: string | undefined,
    text: string,
    clientMessageId: string,
    type?: string,
    attachment?: any,
    replyTo?: any
  ) => void;
  flushPendingOutbox: () => void;
  markAsRead: (conversationId: string) => void;
  startTyping: (conversationId: string, receiverId?: string) => void;
  stopTyping: (conversationId: string, receiverId?: string) => void;
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

  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activeChatRef = useRef<string | null>(null);
  const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    activeChatRef.current = activeConversationId;
  }, [activeConversationId]);

  // Fast Reconnect Trigger (Lifecycle, Network change, Watchdog, Manual)
  const reconnectNow = useCallback(() => {
    const currentSocket = socketRef.current;
    console.log('[Socket] ⚡ Fast Reconnect triggered. Socket state:', currentSocket?.connected ? 'connected' : 'disconnected');

    // 1. Proactively hit /api/health to immediately spin up / wake cloud backend if cold
    const baseUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (window.location.origin.includes('localhost') || window.location.origin.includes('file')
        ? 'https://kotha-hobe-api.onrender.com'
        : window.location.origin);

    fetch(`${baseUrl}/api/health`, { cache: 'no-store' })
      .then((res) => {
        if (res.ok && socketRef.current && !socketRef.current.connected) {
          console.log('[Socket] 💓 Health check OK. Re-triggering socket.connect()...');
          socketRef.current.connect();
        }
      })
      .catch((err) => {
        console.warn('[Socket] Health check ping during reconnect note:', err?.message || err);
      });

    // 2. Connect socket immediately if disconnected
    if (currentSocket) {
      if (!currentSocket.connected) {
        setIsReconnecting(true);
        currentSocket.connect();
      }
    }
  }, []);

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
            id: 'incoming_voice_calls_v2',
            name: 'Incoming Voice Calls',
            description: 'Incoming live calls from Kotha Hobe',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
            lights: true,
          });
          console.log('[Push] Notification channels "chat_messages" and "incoming_voice_calls_v2" created');
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
            console.log(`[Push] FCM Registration Listener Success: fingerprint ${fingerprint}`);
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
            console.log('[Push] Push received in foreground:', notification.title, notification.data);
            const data = notification.data;
            if (data && (data.type === 'incoming_call' || data.callId)) {
              window.dispatchEvent(new CustomEvent('kothahobe:incoming_call', { detail: data }));
            }
          });

          // 4. Register with FCM via Google Play Services
          console.log('[Push] Calling PushNotifications.register()...');
          await PushNotifications.register();

          // 5. Direct Token Retrieval Fallback (guarantees token is sent to backend even if registration event already fired previously)
          try {
            const CallPlugin = (window as any).Capacitor?.Plugins?.CallNotification;
            if (CallPlugin && typeof CallPlugin.getFcmToken === 'function') {
              const tokenRes = await CallPlugin.getFcmToken();
              if (tokenRes && tokenRes.token) {
                console.log('[Push] Direct FCM Token sync on startup:', tokenRes.token.slice(-6));
                setPushToken(tokenRes.token);
                registerPushTokenApi(tokenRes.token).catch((e) => console.warn('[Push] Direct sync error:', e));
              }
            }
          } catch (e) {
            console.warn('[Push] Direct token fetch fallback notice:', e);
          }

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

  // Socket Connection Lifecycle
  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
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

    console.log('[Socket] Initializing Socket.IO connection to:', socketUrl);

    const newSocket = io(socketUrl, {
      auth: { token },
      extraHeaders: {
        'Bypass-Tunnel-Reminder': 'true',
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity, // Never stop reconnecting
      reconnectionDelay: 500,        // Start reconnecting immediately in 500ms
      reconnectionDelayMax: 3000,     // Cap max delay at 3s
      randomizationFactor: 0.2,
      timeout: 10000,
      autoConnect: true,
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[Socket] ✅ Connected with ID:', newSocket.id);
      setIsConnected(true);
      setIsReconnecting(false);

      // Automatically flush any messages queued while offline!
      flushOutbox(newSocket);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('[Socket] ⚠️ Disconnected:', reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect; explicitly reconnect
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.warn('[Socket] Connect error:', error.message);
      setIsConnected(false);
      setIsReconnecting(true);
    });

    newSocket.on('reconnect_attempt', () => {
      setIsReconnecting(true);
    });

    newSocket.on('reconnect', () => {
      console.log('[Socket] 🔄 Reconnected successfully!');
      setIsConnected(true);
      setIsReconnecting(false);
      flushOutbox(newSocket);
    });

    // Remove from Outbox when message is confirmed sent by server and update cache
    newSocket.on('message:sent', (sentMsg: IMessage) => {
      const outbox = getStoredOutbox();
      const filtered = outbox.filter((item) => item.clientMessageId !== sentMsg.clientMessageId);
      saveOutbox(filtered);

      // Instantly update local conversation cache
      if (sentMsg.conversationId) {
        try {
          const cacheKey = `kotha_hobe_msgs_${sentMsg.conversationId}`;
          const cached = localStorage.getItem(cacheKey);
          const currentList: IMessage[] = cached ? JSON.parse(cached) : [];
          const updated = currentList.map((m) =>
            m.clientMessageId === sentMsg.clientMessageId || m._id === sentMsg._id
              ? { ...m, ...sentMsg, status: sentMsg.status || 'sent' }
              : m
          );
          if (!updated.some((m) => m._id === sentMsg._id || m.clientMessageId === sentMsg.clientMessageId)) {
            updated.push(sentMsg);
          }
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch {}
      }

      window.dispatchEvent(new CustomEvent('kothahobe:message_sent', { detail: sentMsg }));
    });

    // Handle incoming new message & sync to cache
    newSocket.on('message:new', async (newMsg: IMessage) => {
      if (newMsg.conversationId) {
        try {
          const cacheKey = `kotha_hobe_msgs_${newMsg.conversationId}`;
          const cached = localStorage.getItem(cacheKey);
          const currentList: IMessage[] = cached ? JSON.parse(cached) : [];
          if (!currentList.some((m) => m._id === newMsg._id || m.clientMessageId === newMsg.clientMessageId)) {
            currentList.push(newMsg);
            localStorage.setItem(cacheKey, JSON.stringify(currentList));
          }
        } catch {}
      }

      window.dispatchEvent(new CustomEvent('kothahobe:message_new', { detail: newMsg }));

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

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [token, user]);

  // App Lifecycle & Network Watcher for Instant Reconnect
  useEffect(() => {
    if (!token || !user) return;

    // 1. Capacitor Native App State Change (Foreground Resume)
    let capAppListener: any = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', (state) => {
        console.log('[AppLifecycle] appStateChange isActive:', state.isActive);
        if (state.isActive) {
          reconnectNow();
        }
      })
        .then((l) => {
          capAppListener = l;
        })
        .catch(() => {});
    }

    // 2. Web Visibility & Focus Listeners
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[AppLifecycle] document visibility -> visible');
        reconnectNow();
      }
    };

    const handleFocus = () => {
      console.log('[AppLifecycle] window focus event');
      reconnectNow();
    };

    const handleOnline = () => {
      console.log('[Network] Network online event detected');
      reconnectNow();
    };

    const handleResume = () => {
      console.log('[AppLifecycle] window resume event');
      reconnectNow();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('resume', handleResume);
    window.addEventListener('pageshow', handleFocus);

    return () => {
      if (capAppListener && typeof capAppListener.remove === 'function') {
        capAppListener.remove();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('resume', handleResume);
      window.removeEventListener('pageshow', handleFocus);
    };
  }, [token, user, reconnectNow]);

  // Offline Watchdog Timer: When disconnected, proactively ping backend health every 3.5s
  useEffect(() => {
    if (!token || !user) {
      if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
      return;
    }

    if (!isConnected) {
      console.log('[Watchdog] Socket is offline. Starting health recovery watchdog...');
      watchdogIntervalRef.current = setInterval(() => {
        if (!socketRef.current?.connected) {
          console.log('[Watchdog] 🐕 Pinging health check to recover connection...');
          reconnectNow();
        }
      }, 3500);
    } else {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
    }

    return () => {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
    };
  }, [isConnected, token, user, reconnectNow]);

  // Connected Idle Keep-Alive (Heartbeat every 25s to keep mobile NAT route alive)
  useEffect(() => {
    if (!isConnected || !socketRef.current) {
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      return;
    }

    keepAliveIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('heartbeat');
      } else {
        reconnectNow();
      }
    }, 25000);

    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
    };
  }, [isConnected, reconnectNow]);

  const sendMessage = (
    conversationId: string,
    receiverId: string | undefined,
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

  const startTyping = (conversationId: string, receiverId?: string) => {
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

  const stopTyping = (conversationId: string, receiverId?: string) => {
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
        reconnectNow,
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
