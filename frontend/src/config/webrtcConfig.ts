/**
 * Centralized WebRTC ICE Server Configuration for Kotha Hobe
 * 
 * Supports dynamic secure backend retrieval, Coturn RFC 5766 HMAC auth,
 * Metered managed TURN, custom env configuration, and high-availability public STUN.
 */

import { apiFetch } from '../api/client';

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// Default verified STUN & Active Metered Relay servers (TCP & TLS prioritized for mobile cellular DTLS stability)
const DEFAULT_ICE_SERVERS: RTCIceServerConfig[] = [
  // 1. Google & Cloudflare Public STUN
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
      'stun:stun.relay.metered.ca:80',
    ],
  },
  // 2. Active Metered TURN Relay (TCP and TLS turns prioritized to guarantee DTLS handshake on 4G/5G)
  {
    urls: [
      'turns:global.relay.metered.ca:443?transport=tcp',
      'turn:global.relay.metered.ca:443?transport=tcp',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turn:global.relay.metered.ca:80',
    ],
    username: '874d803c45754bbe76c457cb',
    credential: 'Fs8qsX58ywG3HFHc',
  },
];

let cachedIceServers: RTCIceServerConfig[] = [...DEFAULT_ICE_SERVERS];
let isTurnAvailable = true;

/**
 * Dynamically fetch latest verified ICE servers from backend
 */
export const fetchAndSetIceServers = async (): Promise<RTCIceServerConfig[]> => {
  try {
    const res = await apiFetch<{
      success: boolean;
      turnConfigured: boolean;
      iceServers: RTCIceServerConfig[];
    }>('/calls/ice-servers');

    if (res.success && Array.isArray(res.iceServers) && res.iceServers.length > 0) {
      cachedIceServers = res.iceServers;
      isTurnAvailable = !!res.turnConfigured;
      console.log(
        `[WebRTC Config] Dynamic ICE servers updated from backend (count: ${cachedIceServers.length}, TURN configured: ${isTurnAvailable})`
      );
    }
  } catch (err: any) {
    console.warn('[WebRTC Config] Failed to fetch dynamic ICE servers, using cached/default Metered config:', err?.message || err);
  }

  // Also append client-side build environment TURN if provided
  const clientTurnUrl = (import.meta as any).env?.VITE_TURN_SERVER_URL;
  const clientTurnUser = (import.meta as any).env?.VITE_TURN_USERNAME;
  const clientTurnCred = (import.meta as any).env?.VITE_TURN_CREDENTIAL;

  if (clientTurnUrl && clientTurnUser && clientTurnCred) {
    const alreadyExists = cachedIceServers.some(
      (s) => s.username === clientTurnUser && JSON.stringify(s.urls).includes(clientTurnUrl)
    );
    if (!alreadyExists) {
      cachedIceServers.push({
        urls: clientTurnUrl.includes(',') ? clientTurnUrl.split(',').map((u: string) => u.trim()) : clientTurnUrl,
        username: clientTurnUser,
        credential: clientTurnCred,
      });
      isTurnAvailable = true;
      console.log('[WebRTC Config] Appended client-side build environment TURN server');
    }
  }

  return cachedIceServers;
};

export const getWebRTCConfig = (): RTCConfiguration => {
  return {
    iceServers: cachedIceServers as RTCIceServer[],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
};

export const getSanitizedWebRTCConfig = () => {
  const config = getWebRTCConfig();
  return {
    ...config,
    iceServers: config.iceServers?.map((s) => ({
      urls: s.urls,
      username: s.username ? '***' : undefined,
      credential: s.credential ? '***' : undefined,
    })),
  };
};
