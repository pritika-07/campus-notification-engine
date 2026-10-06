import 'event-source-polyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import WorkflowsPage from './pages/WorkflowsPage';
import SubscribersPage from './pages/SubscribersPage';
import ActivityPage from './pages/ActivityPage';
import InboxPage from './pages/InboxPage';
import { PermissionsEnum } from './context/AuthContext';

const router = createBrowserRouter([
  {
    path: '/signin',
    element: <SignInPage />,
  },
  {
    path: '/signup',
    element: <SignUpPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/workflows" replace /> },
      {
        path: 'workflows',
        element: (
          <ProtectedRoute permissions={[PermissionsEnum.WORKFLOW_READ]}>
            <WorkflowsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'subscribers',
        element: (
          <ProtectedRoute permissions={[PermissionsEnum.SUBSCRIBER_READ]}>
            <SubscribersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'activity',
        element: (
          <ProtectedRoute permissions={[PermissionsEnum.ACTIVITY_READ]}>
            <ActivityPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbox',
        element: (
          <ProtectedRoute permissions={[PermissionsEnum.INBOX_READ]}>
            <InboxPage />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <Navigate to="/workflows" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
