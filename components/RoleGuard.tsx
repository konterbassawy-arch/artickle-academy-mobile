/**
 * RoleGuard — Phase 7
 *
 * Wrapper component that checks the current user's role against
 * a list of allowed roles. Shows children if authorized, shows
 * an "Access Denied" message if not.
 *
 * Usage:
 *   <RoleGuard allowed={[Role.ADMIN, Role.TEACHER]}>
 *     <SomeProtectedComponent />
 *   </RoleGuard>
 */

import React from 'react';
import { Role } from '../types';
import { useApp } from '../context/AppContext';

interface RoleGuardProps {
  /** Roles that are allowed to see the children */
  allowed: Role[];
  /** Optional custom fallback when access is denied */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const RoleGuard: React.FC<RoleGuardProps> = ({ allowed, fallback, children }) => {
  const { currentUser } = useApp();

  if (!currentUser) {
    return null; // Not logged in — show nothing (login screen handles this)
  }

  if (!allowed.includes(currentUser.role)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        color: '#6b7280',
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#ef4444' }}>
          Access Denied
        </h2>
        <p>You do not have permission to view this section.</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGuard;
