/**
 * RoleRedirect — Phase 8
 *
 * Redirects the user to their correct portal based on their role.
 * Used after login and when navigating to "/" or to a wrong portal.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role } from '../types';

const RoleRedirect: React.FC = () => {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  switch (currentUser.role) {
    case Role.ADMIN:
      return <Navigate to="/admin/dashboard" replace />;
    case Role.TEACHER:
      return <Navigate to="/teacher/dashboard" replace />;
    case Role.PARENT:
      return <Navigate to="/parent/dashboard" replace />;
    case Role.STUDENT:
      return <Navigate to="/student/dashboard" replace />;
    case Role.SCHOOL_ADMIN:
      return <Navigate to="/school/dashboard" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

export default RoleRedirect;
