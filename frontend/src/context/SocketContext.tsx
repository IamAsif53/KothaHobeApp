import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { IMessage } from '../types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  sendMessage: (
    conversationId: string,
    receiverId: string,
    text: string,
    clientMessageId: string
  ) => void;
  markAsRead: (conversationId: string) => void;
  startTyping: (conversationId: string, receiverId: string) => void;
  stopTyping: (conversationId: string, receiverId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

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
        ? 'https://52d6d908bbf4b3.lhr.life'
        : window.location.origin);

    const newSocket = io(socketUrl, {
      auth: { token },
      extraHeaders: {
        'Bypass-Tunnel-Reminder': 'true',
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected to server with ID:', newSocket.id);
      setIsConnected(true);
      setIsReconnecting(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.warn('[Socket] Connection error:', error.message);
      setIsConnected(false);
      setIsReconnecting(true);
    });

    newSocket.on('reconnect_attempt', () => {
      setIsReconnecting(true);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user]);

  const sendMessage = (
    conversationId: string,
    receiverId: string,
    text: string,
    clientMessageId: string
  ) => {
    if (socket && isConnected) {
      socket.emit('message:send', {
        conversationId,
        receiverId,
        text,
        clientMessageId,
        type: 'text',
      });
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

      // Auto stop typing after 3 seconds of inactivity
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
        markAsRead,
        startTyping,
        stopTyping,
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
