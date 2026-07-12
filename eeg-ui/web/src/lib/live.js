// Live-streaming bridge to the .NET SignalR hub (Teacher/Student view).
//
// EEG-UI authenticates against Express (cookie session); the .NET analyser/hub
// speaks JWT. The Express BFF brokers a short-lived .NET token (POST /api/eeg-token),
// which we hand to SignalR via accessTokenFactory and to authenticated REST calls
// against the .NET backend (mint/revoke watch tokens, start/end streaming sessions).
import * as signalR from '@microsoft/signalr';
import { api, getToken, apiBase, isDotnet } from '@/lib/api';

// Obtain the JWT + backend URL for the hub.
//   • Consolidated (.NET) mode: our own login token IS the hub token, and the
//     backend is same-origin — no brokering.
//   • Legacy (Express) mode: the BFF brokers a short-lived .NET token.
export async function getEegAccess() {
  if (isDotnet()) {
    return { token: getToken(), backendUrl: apiBase() };
  }
  const { token, backend_url } = await api('POST', '/eeg-token');
  return { token, backendUrl: (backend_url || '').replace(/\/$/, '') };
}

// Build (does NOT start) a hub connection. The JWT rides in accessTokenFactory;
// SignalR also appends it as ?access_token for the WebSocket handshake, which the
// backend's JwtBearer OnMessageReceived wiring reads for /hubs/eeg.
export function buildHub(backendUrl, token) {
  return new signalR.HubConnectionBuilder()
    .withUrl(backendUrl + '/hubs/eeg', { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}

// Authenticated REST against the .NET backend using the brokered JWT.
export async function netFetch(backendUrl, token, method, path, body) {
  const res = await fetch(backendUrl + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || 'HTTP ' + res.status), { status: res.status });
  }
  return res.status === 204 ? null : res.json();
}

export { signalR };
