/**
 * Centralized WebRTC & ICE Server Configuration for Kotha Hobe
 * 
 * Uses public Google STUN servers for direct peer-to-peer audio transmission.
 * Centralized architecture allows seamless plug-in of a self-hosted Coturn TURN server
 * via environment variables in the future without changing call code.
 */

export const getWebRTCConfig = (): RTCConfiguration => {
  const iceServers: RTCIceServer[] = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
      ],
    },
  ];

  // If a self-hosted Coturn server is configured via env, add it
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
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
};
