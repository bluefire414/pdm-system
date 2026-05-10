import axios from 'axios';

let isRedirecting = false;

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pdm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;
      localStorage.removeItem('pdm_token');
      localStorage.removeItem('pdm_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const fetchDocumentHistory = (documentId: string) =>
  client.get(`/documents/${documentId}/history`).then((r) => r.data);

export const fetchDocumentVersionDetail = (documentId: string, version: number) =>
  client.get(`/documents/${documentId}/history/${version}`).then((r) => r.data);

export const downloadReport = async (type: string, filename: string) => {
  const res = await client.get(`/reports/${type}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default client;
