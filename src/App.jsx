import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AddExpense from './pages/AddExpense';
import AddIncome from './pages/AddIncome';
import CategoryBudgets from './pages/CategoryBudgets';
import ManageCategories from './pages/ManageCategories';
import Profile from './pages/Profile';
import ChangePassword from './pages/ChangePassword';
import Reports from './pages/Reports';
import AutoTrack from './pages/AutoTrack';

export default function App() {
  const [summaryData, setSummaryData] = useState(null);

  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Application Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout summaryData={summaryData} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={<Dashboard onSummaryLoaded={(data) => setSummaryData(data)} />}
        />
        <Route path="income" element={<AddIncome />} />
        <Route path="expenses" element={<AddExpense />} />
        <Route path="category-budgets" element={<CategoryBudgets />} />
        <Route path="categories" element={<ManageCategories />} />
        <Route path="reports" element={<Reports />} />
        <Route path="autotrack" element={<AutoTrack />} />
        <Route path="profile" element={<Profile />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>

      {/* Fallback to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
