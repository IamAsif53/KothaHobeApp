import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { IMessage } from '../types';
import { registerPushTokenApi } from '../api/userApi';
import { markConversationReadApi, sendMessageRestApi } from '../api/messageApi';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { setNativeActiveConversation, clearNativeActiveConversation } from '../services/callNotificationService';

interface OutboxItem {
  conversationId: string;
  receiverId?: string;
  text: string;
  clientMessageId: string;
  type?: string;
  attachment?: any;
  replyTo?: any;
  customEmojiId?: string;
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
    replyTo?: any,
    customEmojiId?: string
  ) => void;
  flushPendingOutbox: () => void;
  removeOutboxItem: (clientMessageId?: string) => void;
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
  const ackTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activeChatRef = useRef<string | null>(null);
  const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    activeChatRef.current = activeConversationId;
    if (activeConversationId) {
      setNativeActiveConversation(activeConversationId);
    } else {
      clearNativeActiveConversation();
    }
  }, [activeConversationId]);

  // Fast Reconnect Trigger (Lifecycle, Network change, Watchdog, Manual)
  const reconnectNow = useCallback(() => {
    const currentSocket = socketRef.current;
    console.log('[Socket] ⚡ Fast Reconnect triggered (0ms direct). Socket state:', currentSocket?.connected ? 'connected' : 'disconnected');

    // 1. Immediately connect socket if disconnected or request sync if connected
    if (currentSocket) {
      if (!currentSocket.connected) {
        setIsReconnecting(true);
        currentSocket.connect();
      } else {
        currentSocket.emit('message:sync_request', {
          since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    // 2. Proactively ping health check in background without blocking socket
    const baseUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (window.location.origin.includes('localhost') || window.location.origin.includes('file')
        ? 'https://kotha-hobe-api.onrender.com'
        : window.location.origin);

    fetch(`${baseUrl}/api/health`, { cache: 'no-store' }).catch(() => {});
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

  const removeOutboxItem = (clientMessageId?: string) => {
    if (!clientMessageId) return;
    if (ackTimeoutsRef.current[clientMessageId]) {
      clearTimeout(ackTimeoutsRef.current[clientMessageId]);
      delete ackTimeoutsRef.current[clientMessageId];
    }
    removeSentFromOutbox(clientMessageId);
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
        customEmojiId: item.customEmojiId,
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
      reconnectionDelay: 200,        // Start reconnecting in 200ms
      reconnectionDelayMax: 1500,     // Cap max delay at 1.5s
      randomizationFactor: 0.1,
      timeout: 8000,
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

      // Request fast delta sync of any missed messages
      newSocket.emit('message:sync_request', {
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });
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

      newSocket.emit('message:sync_request', {
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });
    });

    // Handle incoming batch delta message sync
    newSocket.on('message:sync', (data: { messages: IMessage[]; serverTime?: string }) => {
      const syncMessages = data?.messages || [];
      if (syncMessages.length === 0) return;

      console.log(`[Socket] ⚡ Processing ${syncMessages.length} synchronized message(s)...`);

      // 1. Group by conversationId and update localStorage caches immediately
      const byConv = new Map<string, IMessage[]>();
      syncMessages.forEach((m) => {
        if (!m.conversationId) return;
        const list = byConv.get(m.conversationId) || [];
        list.push(m);
        byConv.set(m.conversationId, list);
      });

      byConv.forEach((newMsgs, convId) => {
        try {
          const cacheKey = `kotha_hobe_msgs_${convId}`;
          const cached = localStorage.getItem(cacheKey);
          const currentList: IMessage[] = cached ? JSON.parse(cached) : [];
          const map = new Map<string, IMessage>();
          currentList.forEach((m) => {
            const k = m._id || m.clientMessageId;
            if (k) map.set(k, m);
          });
          newMsgs.forEach((m) => {
            if (m.clientMessageId && map.has(m.clientMessageId)) {
              map.delete(m.clientMessageId);
            }
            if (m._id) map.set(m._id, m);
          });
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          localStorage.setItem(cacheKey, JSON.stringify(merged));
        } catch {}
      });

      // 2. Update conversation list preview & unread counts
      try {
        const convsCached = localStorage.getItem('kotha_hobe_cached_conversations');
        if (convsCached) {
          const list = JSON.parse(convsCached);
          let changed = false;

          byConv.forEach((msgs, convId) => {
            const idx = list.findIndex((c: any) => c._id === convId);
            const latestMsg = msgs[msgs.length - 1];
            if (idx > -1 && latestMsg) {
              const isActive = activeChatRef.current === convId;
              list[idx] = {
                ...list[idx],
                lastMessage: {
                  text: latestMsg.text,
                  senderId: latestMsg.senderId,
                  createdAt: latestMsg.createdAt,
                  status: isActive ? 'read' : latestMsg.status || 'sent',
                },
                lastMessageAt: latestMsg.createdAt,
                unreadCount: isActive ? 0 : Math.max(list[idx].unreadCount || 0, msgs.length),
              };
              changed = true;
            }
          });

          if (changed) {
            list.sort(
              (a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
            );
            localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(list));
          }
        }
      } catch {}

      // 3. Dispatch global window event for live active components
      window.dispatchEvent(
        new CustomEvent('kothahobe:message_sync', { detail: syncMessages })
      );
    });

    // Remove from Outbox when message is confirmed sent by server and update cache
    newSocket.on('message:sent', (sentMsg: IMessage) => {
      if (sentMsg.clientMessageId && ackTimeoutsRef.current[sentMsg.clientMessageId]) {
        clearTimeout(ackTimeoutsRef.current[sentMsg.clientMessageId]);
        delete ackTimeoutsRef.current[sentMsg.clientMessageId];
      }
      removeSentFromOutbox(sentMsg.clientMessageId);

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
          if (!currentList.some((m) => m._id === newMsg._id || (m.clientMessageId && newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId))) {
            currentList.push(newMsg);
            currentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            localStorage.setItem(cacheKey, JSON.stringify(currentList));
          }

          // Immediately update conversation preview in local storage
          const convsCached = localStorage.getItem('kotha_hobe_cached_conversations');
          if (convsCached) {
            const list = JSON.parse(convsCached);
            const idx = list.findIndex((c: any) => c._id === newMsg.conversationId);
            if (idx > -1) {
              const isActive = activeChatRef.current === newMsg.conversationId;
              list[idx] = {
                ...list[idx],
                lastMessage: {
                  text: newMsg.text,
                  senderId: newMsg.senderId,
                  createdAt: newMsg.createdAt,
                  status: isActive ? 'read' : newMsg.status || 'sent',
                },
                lastMessageAt: newMsg.createdAt,
                unreadCount: isActive ? 0 : (list[idx].unreadCount || 0) + 1,
              };
              list.sort(
                (a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
              );
              localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(list));
            }
          }
        } catch {}
      }

      window.dispatchEvent(new CustomEvent('kothahobe:message_new', { detail: newMsg }));
      if (newMsg.conversationId) {
        try {
          const cacheKey = `kotha_hobe_msgs_${newMsg.conversationId}`;
          const cached = localStorage.getItem(cacheKey);
          const currentList: IMessage[] = cached ? JSON.parse(cached) : [];
          if (!currentList.some((m) => m._id === newMsg._id || (m.clientMessageId && newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId))) {
            currentList.push(newMsg);
            currentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            localStorage.setItem(cacheKey, JSON.stringify(currentList));
          }

          // Immediately update conversation preview in local storage
          const convsCached = localStorage.getItem('kotha_hobe_cached_conversations');
          if (convsCached) {
            const list = JSON.parse(convsCached);
            const idx = list.findIndex((c: any) => c._id === newMsg.conversationId);
            if (idx > -1) {
              const isActive = activeChatRef.current === newMsg.conversationId;
              list[idx] = {
                ...list[idx],
                lastMessage: {
                  text: newMsg.text,
                  senderId: newMsg.senderId,
                  createdAt: newMsg.createdAt,
                  status: isActive ? 'read' : newMsg.status || 'sent',
                },
                lastMessageAt: newMsg.createdAt,
                unreadCount: isActive ? 0 : (list[idx].unreadCount || 0) + 1,
              };
              list.sort(
                (a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
              );
              localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(list));
            }
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

        let senderName = newMsg.senderNickname || 'New Message';
        let senderAvatar: string | undefined = undefined;
        let isGroup = false;
        let groupName: string | undefined = undefined;

        try {
          const cachedConvs = localStorage.getItem('kotha_hobe_cached_conversations');
          if (cachedConvs) {
            const parsed = JSON.parse(cachedConvs);
            const conv = parsed.find((c: any) => c._id === newMsg.conversationId || c.recipient?._id === newMsg.senderId);
            if (conv) {
              if (conv.isGroup) {
                isGroup = true;
                groupName = conv.groupMeta?.name || 'Group Chat';
                senderName = newMsg.senderNickname || (conv.groupMeta?.nicknames && conv.groupMeta.nicknames[newMsg.senderId]) || 'Group Member';
                senderAvatar = conv.groupMeta?.avatarUrl;
              } else if (conv.recipient) {
                senderName = conv.recipient.displayName || conv.recipient.username || 'New Message';
                senderAvatar = conv.recipient.avatarUrl;
              }
            }
          }
        } catch {}

        let previewText = newMsg.text;
        if (newMsg.type === 'image') previewText = '📷 Photo';
        else if (newMsg.type === 'audio') previewText = '🎤 Voice message';
        else if (newMsg.type === 'document') previewText = `📄 ${newMsg.attachment?.fileName || 'Document'}`;
        else if (newMsg.type === 'custom_emoji') previewText = '✨ Animated Emoji';

        const bodyText = previewPref ? (previewText || 'Sent a message') : 'Sent you a new message';

        // 1. Dispatch In-App Interactive Notification Banner Event (when inside the app)
        window.dispatchEvent(
          new CustomEvent('kothahobe:inapp_notification', {
            detail: {
              conversationId: newMsg.conversationId,
              senderId: newMsg.senderId,
              senderName,
              senderAvatar,
              messageText: previewText || 'Sent a message',
              isGroup,
              groupName,
              messageType: newMsg.type,
              createdAt: newMsg.createdAt,
            },
          })
        );
      } catch (err) {
        console.warn('[Notifications] Trigger notice:', err);
      }
    });

    newSocket.on('group:join_requested', (data: any) => {
      try {
        const groupName = data.groupName || 'Group';
        const senderName = data.user?.displayName || data.user?.username || data.inviterName || 'Someone';
        const senderAvatar = data.user?.avatarUrl || '';
        window.dispatchEvent(
          new CustomEvent('kothahobe:inapp_notification', {
            detail: {
              conversationId: data.conversationId,
              senderId: data.user?._id || '',
              senderName: `${senderName} requested to join`,
              senderAvatar,
              messageText: `Approval required in ${groupName}`,
              isGroup: true,
              groupName,
              messageType: 'text',
              createdAt: new Date().toISOString(),
            },
          })
        );
      } catch (err) {
        console.warn('[Socket] group:join_requested notice:', err);
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
    replyTo?: any,
    customEmojiId?: string
  ) => {
    const payload = {
      conversationId,
      receiverId,
      text,
      clientMessageId,
      type,
      attachment,
      replyTo,
      customEmojiId,
    };

    const outbox = getStoredOutbox();
    if (!outbox.some((item) => item.clientMessageId === clientMessageId)) {
      outbox.push({
        ...payload,
        timestamp: Date.now(),
      });
      saveOutbox(outbox);
    }

    if (socket && isConnected) {
      socket.emit('message:send', payload);
    }

    if (ackTimeoutsRef.current[clientMessageId]) {
      clearTimeout(ackTimeoutsRef.current[clientMessageId]);
    }

    // 4.5s Automatic REST Fallback / Failure Watchdog
    ackTimeoutsRef.current[clientMessageId] = setTimeout(async () => {
      delete ackTimeoutsRef.current[clientMessageId];
      console.warn(`[Socket] ⚠️ No ACK received for ${clientMessageId} within 4.5s. Triggering HTTP REST fallback...`);

      try {
        const res = await sendMessageRestApi(payload);
        if (res.success && res.message) {
          console.log(`[Socket] ✅ Message ${clientMessageId} sent successfully via HTTP REST fallback.`);
          removeOutboxItem(clientMessageId);

          if (conversationId) {
            try {
              const cacheKey = `kotha_hobe_msgs_${conversationId}`;
              const cached = localStorage.getItem(cacheKey);
              const currentList: IMessage[] = cached ? JSON.parse(cached) : [];
              const updated = currentList.map((m) =>
                m.clientMessageId === clientMessageId || m._id === res.message!._id
                  ? { ...m, ...res.message, status: res.message!.status || 'sent' }
                  : m
              );
              if (!updated.some((m) => m._id === res.message!._id || m.clientMessageId === clientMessageId)) {
                updated.push(res.message);
              }
              localStorage.setItem(cacheKey, JSON.stringify(updated));
            } catch {}
          }

          window.dispatchEvent(new CustomEvent('kothahobe:message_sent', { detail: res.message }));
          return;
        }
      } catch (err) {
        console.warn(`[Socket] REST fallback failed for ${clientMessageId}:`, err);
      }

      // If REST fallback also failed, mark as failed so user can retry or delete
      console.warn(`[Socket] ❌ Message ${clientMessageId} marked as failed.`);
      if (conversationId) {
        try {
          const cacheKey = `kotha_hobe_msgs_${conversationId}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const currentList: IMessage[] = JSON.parse(cached);
            const updated = currentList.map((m) =>
              m.clientMessageId === clientMessageId
                ? { ...m, status: 'failed' as const }
                : m
            );
            localStorage.setItem(cacheKey, JSON.stringify(updated));
          }
        } catch {}
      }

      window.dispatchEvent(
        new CustomEvent('kothahobe:message_failed', {
          detail: { clientMessageId, conversationId },
        })
      );
    }, 4500);
  };

  const flushPendingOutbox = () => {
    if (socket && isConnected) {
      flushOutbox(socket);
    }
  };

  const markAsRead = (conversationId: string) => {
    if (!conversationId) return;

    // 1. Immediately update local conversation cache in localStorage
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cached) {
        const list = JSON.parse(cached);
        const idx = list.findIndex((c: any) => c._id === conversationId);
        if (idx > -1) {
          list[idx] = {
            ...list[idx],
            unreadCount: 0,
            lastMessage: list[idx].lastMessage
              ? { ...list[idx].lastMessage, status: 'read' }
              : undefined,
          };
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(list));
        }
      }
    } catch {}

    // 2. Dispatch event for all active subscribers (ChatList, notification banners, unread badges)
    window.dispatchEvent(
      new CustomEvent('kothahobe:conversation_read', {
        detail: { conversationId, readAt: new Date().toISOString() },
      })
    );

    // 3. Emit over socket if connected
    if (socket && isConnected) {
      socket.emit('message:read', { conversationId });
    } else {
      // 4. Fallback to background REST API
      markConversationReadApi(conversationId).catch(() => {});
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
        removeOutboxItem,
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
