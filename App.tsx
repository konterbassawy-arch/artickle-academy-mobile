
import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Financials } from './pages/Financials';
import { LessonLog } from './pages/LessonLog';
import { Configuration } from './pages/Configuration';
import { Attendance } from './pages/Attendance';
import { MyStudents } from './pages/MyStudents';
import { TeacherFinance } from './pages/TeacherFinance';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRedirect from './components/RoleRedirect';
import RoleGuard from './components/RoleGuard';
import PlaceholderPage from './pages/placeholders/PlaceholderPage';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminStudents } from './pages/admin/AdminStudents';
import { AdminStudentDetail } from './pages/admin/AdminStudentDetail';
import { AdminTeacherDetail } from './pages/admin/AdminTeacherDetail';
import { UserManagement } from './pages/admin/UserManagement';
import { ParentOnboarding } from './pages/admin/ParentOnboarding';
import { TeacherProfile } from './pages/teacher/TeacherProfile';
import { ParentDashboard } from './pages/parent/ParentDashboard';
import { ParentStudentDetail } from './pages/parent/ParentStudentDetail';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentLessons } from './pages/student/StudentLessons';
import { SchoolDashboard } from './pages/school/SchoolDashboard';
import { SchoolLessons } from './pages/school/SchoolLessons';
import { SchoolStudents } from './pages/school/SchoolStudents';
import { SchoolStudentDetail } from './pages/school/SchoolStudentDetail';
import { SchoolInvoices } from './pages/school/SchoolInvoices';
import { BookingManagement } from './pages/admin/BookingManagement';
import { BookingRequest } from './pages/parent/BookingRequest';
import { ParentBilling } from './pages/parent/ParentBilling';
import { ParentEnrollments } from './pages/parent/ParentEnrollments';
import { TeacherBookings } from './pages/teacher/TeacherBookings';
import { ScheduleManager } from './pages/admin/ScheduleManager';
import { EnrollmentManagement } from './pages/admin/EnrollmentManagement';
import { SchoolPeriodManager } from './pages/admin/SchoolPeriodManager';
import { InvoiceManagement } from './pages/admin/InvoiceManagement';
import { PaymentManagement } from './pages/admin/PaymentManagement';
import { PayrollManagement } from './pages/admin/PayrollManagement';
import { MySchedule } from './pages/teacher/MySchedule';
import { TeacherPayroll } from './pages/teacher/TeacherPayroll';
import { TeacherStudentDetail } from './pages/teacher/TeacherStudentDetail';
import { StudentSelfView } from './pages/student/StudentSelfView';
import { EnrollmentReview } from './pages/admin/EnrollmentReview';
import { TeachingAssignmentBackfill } from './pages/admin/TeachingAssignmentBackfill';
import { BulkReportsPage } from './pages/BulkReportsPage';
import { LessonGrammarFixer } from './pages/admin/LessonGrammarFixer';
import { Role } from './types';

// ---------------------------
// Portal layout shell (shared sidebar + content area)
// ---------------------------

/** Scrolls the main content area to the top on every route change. */
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
};

const PortalLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const isFullBleed = pathname.endsWith('/reports');
  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <main
        id="main-scroll"
        className={`flex-1 bg-slate-950 ${isFullBleed ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
      >
        <ScrollToTop />
        {isFullBleed ? children : (
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        )}
      </main>
    </div>
  );
};

// ---------------------------
// Nested route groups
// ---------------------------

const AdminRoutes: React.FC = () => (
  <Routes>
    <Route path="dashboard" element={<AdminOverview />} />
    <Route path="users" element={<UserManagement />} />
    <Route path="students" element={<AdminStudents />} />
    <Route path="students/:studentId" element={<AdminStudentDetail />} />
    <Route path="teachers/:teacherId" element={<AdminTeacherDetail />} />
    <Route path="parents" element={<Navigate to="/admin/config?tab=parents" replace />} />
    <Route path="bookings" element={<BookingManagement />} />
    <Route path="enrollments" element={<EnrollmentManagement />} />
    <Route path="enrollment-review" element={<EnrollmentReview />} />
    <Route path="school-periods" element={<SchoolPeriodManager />} />
    <Route path="invoices" element={<InvoiceManagement />} />
    <Route path="payments" element={<PaymentManagement />} />
    <Route path="payroll" element={<PayrollManagement />} />
    <Route path="schedule" element={<ScheduleManager />} />
    <Route path="teaching-assignment-backfill" element={<TeachingAssignmentBackfill />} />
    <Route path="finance" element={<Financials />} />
    <Route path="lessons" element={<LessonLog />} />
    <Route path="grammar-fixer" element={<LessonGrammarFixer />} />
    <Route path="config" element={<Configuration />} />
    <Route path="reports" element={<BulkReportsPage mode="full" />} />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Routes>
);

const TeacherRoutes: React.FC = () => (
  <Routes>
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="profile" element={<TeacherProfile />} />
    <Route path="students" element={<MyStudents />} />
    <Route path="students/:studentId" element={<TeacherStudentDetail />} />
    <Route path="attendance" element={<Attendance />} />
    <Route path="bookings" element={<TeacherBookings />} />
    <Route path="schedule" element={<MySchedule />} />
    <Route path="payroll" element={<TeacherPayroll />} />
    <Route path="finance" element={<TeacherFinance />} />
    <Route path="lessons" element={<LessonLog />} />
    <Route path="reports" element={<BulkReportsPage mode="full" />} />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Routes>
);

const ParentRoutes: React.FC = () => (
  <Routes>
    <Route path="dashboard" element={<ParentDashboard />} />
    <Route path="child/:childId" element={<ParentStudentDetail />} />
    <Route path="bookings" element={<BookingRequest />} />
    <Route path="billing" element={<ParentBilling />} />
    <Route path="enrollments" element={<ParentEnrollments />} />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Routes>
);

const StudentRoutes: React.FC = () => (
  <Routes>
    <Route path="dashboard" element={<StudentDashboard />} />
    <Route path="lessons" element={<StudentLessons />} />
    <Route path="progress" element={<StudentSelfView />} />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Routes>
);

const SchoolRoutes: React.FC = () => (
  <Routes>
    <Route path="dashboard" element={<SchoolDashboard />} />
    <Route path="lessons" element={<SchoolLessons />} />
    <Route path="students" element={<SchoolStudents />} />
    <Route path="students/:studentId" element={<SchoolStudentDetail />} />
    <Route path="school-periods" element={<SchoolPeriodManager />} />
    <Route path="invoices" element={<SchoolInvoices />} />
    <Route path="reports" element={<BulkReportsPage mode="export-only" />} />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Routes>
);

// ---------------------------
// App component
// ---------------------------

const App: React.FC = () => {
  const { currentUser, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 mt-4 font-medium tracking-widest uppercase text-xs">Securing Session...</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public: Login */}
      <Route path="/login" element={!currentUser ? <Login /> : <RoleRedirect />} />

      {/* Root: redirect to correct portal */}
      <Route path="/" element={
        currentUser ? <RoleRedirect /> : <Navigate to="/login" replace />
      } />

      {/* Admin portal */}
      <Route path="/admin/*" element={
        <ProtectedRoute>
          <RoleGuard allowed={[Role.ADMIN]} fallback={<RoleRedirect />}>
            <PortalLayout>
              <AdminRoutes />
            </PortalLayout>
          </RoleGuard>
        </ProtectedRoute>
      } />

      {/* Teacher portal */}
      <Route path="/teacher/*" element={
        <ProtectedRoute>
          <RoleGuard allowed={[Role.TEACHER]} fallback={<RoleRedirect />}>
            <PortalLayout>
              <TeacherRoutes />
            </PortalLayout>
          </RoleGuard>
        </ProtectedRoute>
      } />

      {/* Parent portal (Phase 11) */}
      <Route path="/parent/*" element={
        <ProtectedRoute>
          <RoleGuard allowed={[Role.PARENT]} fallback={<RoleRedirect />}>
            <PortalLayout>
              <ParentRoutes />
            </PortalLayout>
          </RoleGuard>
        </ProtectedRoute>
      } />

      {/* Student portal (Phase 11) */}
      <Route path="/student/*" element={
        <ProtectedRoute>
          <RoleGuard allowed={[Role.STUDENT]} fallback={<RoleRedirect />}>
            <PortalLayout>
              <StudentRoutes />
            </PortalLayout>
          </RoleGuard>
        </ProtectedRoute>
      } />

      {/* School admin portal (Phase 12) */}
      <Route path="/school/*" element={
        <ProtectedRoute>
          <RoleGuard allowed={[Role.SCHOOL_ADMIN]} fallback={<RoleRedirect />}>
            <PortalLayout>
              <SchoolRoutes />
            </PortalLayout>
          </RoleGuard>
        </ProtectedRoute>
      } />

      {/* Catch-all: redirect to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
