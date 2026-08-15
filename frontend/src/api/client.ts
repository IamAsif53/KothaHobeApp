const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://kotha-hobe-api.onrender.com';

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('kotha_hobe_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'API request failed');
  }

  return data as T;
}
