
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role } from '../types';
import { DeleteAccountModal } from './DeleteAccountModal';

export const Sidebar: React.FC = () => {
  const { currentUser, logout, persistenceMode } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const portalPrefix = currentUser?.role === Role.ADMIN ? '/admin'
    : currentUser?.role === Role.TEACHER ? '/teacher'
    : currentUser?.role === Role.PARENT ? '/parent'
    : currentUser?.role === Role.STUDENT ? '/student'
    : currentUser?.role === Role.SCHOOL_ADMIN ? '/school'
    : '';

  const handleNavigation = (path: string) => {
    navigate(`${portalPrefix}/${path}`);
    setIsMenuOpen(false);
  };

  const isActive = (path: string) => location.pathname === `${portalPrefix}/${path}`;

  const navItemClass = (path: string) =>
    `w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 flex items-center gap-3 ${
      isActive(path)
        ? 'bg-primary-600/90 text-white font-semibold shadow-md shadow-primary-600/20'
        : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
    }`;

  const sectionLabel = (label: string) => (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
  );

  return (
    <div className={`bg-slate-950 flex flex-col shrink-0 z-50 md:h-full md:w-60 md:border-r md:border-slate-800/60 ${isMenuOpen ? 'fixed inset-0' : 'border-b border-slate-800/60'}`}>
      {/* Logo + status */}
      <div className="px-5 py-5 md:py-6 flex justify-between items-center">
         <div className="flex items-start gap-3">
            <img src="/logo.png" alt="" className="h-14 w-14 object-contain opacity-90 shrink-0 drop-shadow-md" style={{maxWidth: '58px', maxHeight: '58px'}} />
            <div>
            <h1 className="text-lg font-extrabold tracking-tight leading-none" style={{color: '#1f80ff'}}>
              Artickle
            </h1>
            <p className="text-[10px] font-semibold text-white uppercase tracking-wider mt-0.5">Academy</p>
            <div className="flex items-center gap-1.5 mt-2">
                <div className={`w-1.5 h-1.5 rounded-full ${persistenceMode === 'local' ? 'bg-amber-500' : persistenceMode === 'syncing' ? 'bg-blue-400 animate-pulse' : 'bg-emerald-500'}`}></div>
                <p className="text-[9px] text-slate-600 uppercase tracking-wider font-medium text-nowrap">
                    {persistenceMode === 'local' ? 'Local Mode' : persistenceMode === 'syncing' ? 'Syncing...' : 'Cloud Connected'}
                </p>
            </div>
            </div>
         </div>
         <button
           onClick={() => setIsMenuOpen(!isMenuOpen)}
           className="md:hidden text-slate-400 hover:text-white focus:outline-none p-2.5 -mr-1"
         >
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             {isMenuOpen ? (
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             ) : (
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
             )}
           </svg>
         </button>
      </div>

      <div className={`${isMenuOpen ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden transition-all duration-300`}>
          <nav className="flex-1 px-3 pb-3 space-y-0.5 overflow-y-auto">
            {sectionLabel('Main')}
            <button onClick={() => handleNavigation('dashboard')} className={navItemClass('dashboard')}>
              Dashboard
            </button>

            {currentUser?.role === Role.ADMIN && (
                <>
                    {sectionLabel('People')}
                    <button onClick={() => handleNavigation('users')} className={navItemClass('users')}>
                    Users
                    </button>
                    <button onClick={() => handleNavigation('students')} className={navItemClass('students')}>
                    Students
                    </button>

                    {sectionLabel('Operations')}
                    <button onClick={() => handleNavigation('reports')} className={navItemClass('reports')}>
                    Reports
                    </button>
                    <button onClick={() => handleNavigation('bookings')} className={navItemClass('bookings')}>
                    Bookings
                    <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                    </button>
                    <button onClick={() => handleNavigation('enrollments')} className={navItemClass('enrollments')}>
                    Enrollments
                    </button>
                    <button onClick={() => handleNavigation('schedule')} className={navItemClass('schedule')}>
                    Schedule
                    <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                    </button>

                    {sectionLabel('Finance')}
                    <button onClick={() => handleNavigation('invoices')} className={navItemClass('invoices')}>
                    Invoices
                    </button>
                    <button onClick={() => handleNavigation('payments')} className={navItemClass('payments')}>
                    Payments
                    </button>
                    <button onClick={() => handleNavigation('payroll')} className={navItemClass('payroll')}>
                    Payroll
                    </button>
                    <button onClick={() => handleNavigation('finance')} className={navItemClass('finance')}>
                    Financials
                    </button>

                    {sectionLabel('System')}
                    <button onClick={() => handleNavigation('config')} className={navItemClass('config')}>
                    Configuration
                    </button>
                </>
            )}

            {currentUser?.role === Role.TEACHER && (
               <>
                 {sectionLabel('Teaching')}
                 <button onClick={() => handleNavigation('students')} className={navItemClass('students')}>
                   My Students
                 </button>
                 <button onClick={() => handleNavigation('reports')} className={navItemClass('reports')}>
                   Reports
                 </button>
                 <button onClick={() => handleNavigation('attendance')} className={navItemClass('attendance')}>
                   Take Attendance
                 </button>
                 <button onClick={() => handleNavigation('bookings')} className={navItemClass('bookings')}>
                   My Bookings
                   <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                 </button>
                 <button onClick={() => handleNavigation('schedule')} className={navItemClass('schedule')}>
                   My Schedule
                   <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                 </button>

                 {sectionLabel('Finance')}
                 <button onClick={() => handleNavigation('payroll')} className={navItemClass('payroll')}>
                   My Payroll
                 </button>
                 <button onClick={() => handleNavigation('finance')} className={navItemClass('finance')}>
                   My Finances
                 </button>
               </>
            )}

            {currentUser?.role === Role.SCHOOL_ADMIN && (
              <>
                <button onClick={() => handleNavigation('lessons')} className={navItemClass('lessons')}>
                  School Lessons
                </button>
                <button onClick={() => handleNavigation('students')} className={navItemClass('students')}>
                  Students
                </button>
                <button onClick={() => handleNavigation('reports')} className={navItemClass('reports')}>
                  Export Reports
                </button>
              </>
            )}

            {currentUser?.role === Role.PARENT && (
              <>
                <button onClick={() => handleNavigation('bookings')} className={navItemClass('bookings')}>
                  Bookings
                  <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                </button>
                <button onClick={() => handleNavigation('enrollments')} className={navItemClass('enrollments')}>
                  Enrollments
                  <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                </button>
                <button onClick={() => handleNavigation('billing')} className={navItemClass('billing')}>
                  My Billing
                  <span className="ml-auto text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Soon</span>
                </button>
              </>
            )}

            {currentUser?.role === Role.STUDENT && (
              <>
                <button onClick={() => handleNavigation('lessons')} className={navItemClass('lessons')}>
                  My Lessons
                </button>
                <button onClick={() => handleNavigation('progress')} className={navItemClass('progress')}>
                  My Progress
                </button>
              </>
            )}

            {currentUser?.role !== Role.PARENT && currentUser?.role !== Role.STUDENT && currentUser?.role !== Role.SCHOOL_ADMIN && (
              <button onClick={() => handleNavigation('lessons')} className={navItemClass('lessons')}>
                {currentUser?.role === Role.TEACHER ? 'My Lessons' : 'Lessons Log'}
              </button>
            )}
          </nav>

          <div className="p-3 border-t border-slate-800/60">
            <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-white/5 backdrop-blur-xl ring-1 ring-white/10">
                <div className="w-8 h-8 rounded-full bg-primary-500/15 text-primary-300 flex items-center justify-center font-bold text-xs ring-1 ring-primary-500/20">
                    {currentUser?.name.charAt(0)}
                </div>
                <div className="overflow-hidden flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate leading-tight">{currentUser?.name}</p>
                    <p className="text-[10px] text-slate-500 capitalize leading-tight">{currentUser?.role}</p>
                </div>
            </div>
            <button
              onClick={logout}
              className="w-full py-2 px-3 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 text-xs font-medium transition-colors"
            >
              Sign Out
            </button>
            <button
              onClick={() => setShowDeleteAccount(true)}
              className="w-full mt-1 py-2 px-3 rounded-lg text-slate-600 hover:text-red-300 hover:bg-red-500/10 text-xs font-medium transition-colors"
            >
              Delete Account
            </button>
          </div>
      </div>
      {showDeleteAccount && <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />}
    </div>
  );
};
