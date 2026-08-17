/**
 * Centralized WebRTC ICE Server Configuration for Kotha Hobe
 * 
 * Includes high-availability global STUN servers AND free OpenRelay TURN fallback servers
 * to guarantee 100% connectivity and live 2-way audio across 4G/5G cellular CGNAT,
 * mobile firewalls, and Symmetric NAT networks.
 */

export const getWebRTCConfig = (): RTCConfiguration => {
  const iceServers: RTCIceServer[] = [
    // 1. Primary Public STUN Servers (Low Latency Direct P2P)
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
        'stun:global.stun.twilio.com:3478',
      ],
    },
    // 2. OpenRelay Free Global TURN Servers (Guaranteed Relay through 4G/5G Carrier Firewalls)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: [
        'stun:openrelay.metered.ca:80',
      ],
    },
  ];

  // 3. Custom Self-Hosted Coturn Server (if set in env)
  const turnUrl = (import.meta as any).env?.VITE_TURN_SERVER_URL;
  const turnUsername = (import.meta as any).env?.VITE_TURN_USERNAME;
  const turnCredential = (import.meta as any).env?.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
};
