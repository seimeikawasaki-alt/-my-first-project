import axios from 'axios';
import { toast } from '../stores/toastStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    const status: number | undefined = error.response?.status;
    if (status === 401 && window.location.pathname !== '/login') {
      // Session expired → back to login
      window.location.href = '/login';
    } else if (status === 429) {
      toast.error('リクエストが多すぎます。しばらく待ってから再試行してください');
    } else if (status != null && status >= 500) {
      toast.error('エラーが発生しました。しばらく後に再試行してください');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
