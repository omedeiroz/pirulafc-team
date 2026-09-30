export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data; // corpo da resposta (ex.: retryInMs no 429)
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login' && url !== '/api/me') {
    window.dispatchEvent(new Event('unauthorized'));
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Erro inesperado', data);
  return data;
}

// Envia um arquivo (Blob) cru, com o Content-Type dele.
async function upload(url, blob) {
  const res = await fetch(url, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': blob.type }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event('unauthorized'));
  if (res.status === 413) throw new ApiError(413, 'Imagem muito grande (máx. 5 MB)');
  if (!res.ok) throw new ApiError(res.status, data.error || 'Erro no upload');
  return data;
}

export const api = {
  upload,
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};
