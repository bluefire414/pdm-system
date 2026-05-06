import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PartCategoriesPage from './pages/PartCategoriesPage';
import SeriesPage from './pages/SeriesPage';
import PartsPage from './pages/PartsPage';
import ProductsPage from './pages/ProductsPage';
import DocumentsPage from './pages/DocumentsPage';
import SearchPage from './pages/SearchPage';
import ECNsPage from './pages/ECNsPage';
import NotificationsPage from './pages/NotificationsPage';
import UsersPage from './pages/UsersPage';
import BatchUploadPage from './pages/BatchUploadPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>載入中...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="part-categories" element={<PartCategoriesPage />} />
        <Route path="series" element={<SeriesPage />} />
        <Route path="parts" element={<PartsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="ecns" element={<ECNsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="batch-upload" element={<BatchUploadPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
