
import { Lesson, LessonStatus, School, Student, Teacher, User, Role } from '../types';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

export const generateTestScenario = () => {
  // 1. Schools (s1, s2, s3)
  const schools: School[] = [
    { 
      id: 's1', 
      name: 'Kings College (s1)', 
      code: 'KC', 
      defaultRate: 160, 
      defaultGroupRate: 100,
      minimumDailyHoursByInstrument: {
        'Violin': { minHours: 4, guaranteed: true },
        'Piano': { minHours: 3, guaranteed: true }
      }
    }, 
    { 
      id: 's2', 
      name: 'Downe House (s2)', 
      code: 'DH', 
      defaultRate: 130, 
      defaultGroupRate: 85,
      minimumDailyHoursByInstrument: {
        'Flute': { minHours: 2, guaranteed: true }
      }
    },   
    { 
      id: 's3', 
      name: 'American School (s3)', 
      code: 'AS', 
      defaultRate: 110, 
      defaultGroupRate: 70 
    }, 
  ];

  // 2. Teachers - UPDATED HERE: Clean IDs TT-0001
  const teachers: Teacher[] = [
    { 
      id: 't1_uuid', name: 'Anni (Violin)', instrument: 'Violin', code: 'TT-0001', baseRate: 75, baseGroupRate: 65,
      ratesBySchool: { 's1': 85 } // Higher rate at Kings College
    },
    { 
      id: 't2_uuid', name: 'Sally (Flute)', instrument: 'Flute', code: 'TT-0002', baseRate: 65, baseGroupRate: 55,
      ratesBySchool: { 's2': 75 } // Higher rate at Downe House
    },
    { id: 't3_uuid', name: 'Dana (Piano)', instrument: 'Piano', code: 'TT-0003', baseRate: 70, baseGroupRate: 60 },
    { id: 't4_uuid', name: 'Raymond (Sax)', instrument: 'Saxophone', code: 'TT-0004', baseRate: 90, baseGroupRate: 80 }, 
    { id: 't5_uuid', name: 'Ahmed (Guitar)', instrument: 'Guitar', code: 'TT-0005', baseRate: 60, baseGroupRate: 50 }, 
  ];

  // 3. Admin & Teachers
  const users: User[] = [
    { id: 'admin', username: 'admin', name: 'Master Admin', role: Role.ADMIN, email: 'konterbassawy@gmail.com' },
    ...teachers.map((t, idx) => ({
      id: t.id,
      username: `teacher${idx + 1}`,
      name: t.name,
      role: Role.TEACHER,
      email: `teacher${idx + 1}@artickle.com`,
      instrument: t.instrument
    }))
  ];

  // 4. Students (60 Students) - UPDATED HERE: Clean IDs ST-0001
  const students: Student[] = [];
  const names = ['Ali', 'Omar', 'Fatima', 'Layla', 'Khalid', 'Nora', 'Saad', 'Zain', 'Hana', 'Yusuf', 'Sarah', 'Mohammed', 'Lina', 'Fahad', 'Reem', 'Bader', 'Huda', 'Sami'];
  
  for(let i=0; i<60; i++) {
    const sIdx = i % 3;
    const tIdx = i % 5;
    const studentId = `ST-${String(i + 1).padStart(4, '0')}`;
    students.push({
      id: studentId,
      name: `${names[i % names.length]} ${String.fromCharCode(65+(i%26))}.`,
      schoolId: schools[sIdx].id,
      teacherId: teachers[tIdx].id,
      instrument: teachers[tIdx].instrument
    });
  }

  // 5. Generate Exactly 75 Lessons (25 per school)
  const lessons: Lesson[] = [];
  const counters: Record<string, number> = {}; 
  // Initialize counters
  counters['students'] = 60;
  counters['teachers'] = 5;

  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Current Monday
  const monday = new Date(new Date(now).setDate(diff));
  monday.setHours(8, 0, 0, 0);

  const statuses = [
      LessonStatus.PRESENT, 
      LessonStatus.TAUGHT, 
      LessonStatus.ABSENT_EXCUSED, 
      LessonStatus.ABSENT_UNEXCUSED, 
      LessonStatus.CANCELLED
  ];

  const durations = [30, 45, 60, 90];

  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const school = schools[sIdx];
    
    for (let lIdx = 0; lIdx < 25; lIdx++) {
        const totalIdx = (sIdx * 25) + lIdx;
        const teacher = teachers[totalIdx % 5];
        
        // Scenario Variations
        const dayOffset = lIdx % 5; // Mon-Fri
        const hourOffset = Math.floor(lIdx / 5);
        const durationMinutes = durations[totalIdx % durations.length];
        const status = statuses[totalIdx % statuses.length]; 
        const isGroup = totalIdx % 4 === 0; // Every 4th is a group
        const type = isGroup ? 'Group' : 'Individual';

        const lessonDate = new Date(monday);
        lessonDate.setDate(monday.getDate() + dayOffset);
        lessonDate.setHours(9 + hourOffset, (lIdx % 2 === 0 ? 0 : 30), 0);

        // For lesson keys, we still use schoolCode+teacherShortCode (last 2 digits)
        const teacherShortCode = teacher.code.slice(-2);
        const key = `${school.code}${teacherShortCode}`;
        const currentCount = (counters[key] || 0) + 1;
        counters[key] = currentCount;
        const lessonId = `${school.code}-${teacherShortCode}-${String(currentCount).padStart(4, '0')}`;

        const pool = students.filter(s => s.schoolId === school.id && s.teacherId === teacher.id);
        const primaryStudent = pool.length > 0 ? pool[0] : students[0];
        
        let studentIds = [primaryStudent.id];
        let studentNames = [primaryStudent.name];

        if (isGroup) {
            const extraPool = students.filter(s => s.id !== primaryStudent.id && s.schoolId === school.id).slice(0, 2);
            extraPool.forEach(st => {
                studentIds.push(st.id);
                studentNames.push(st.name);
            });
        }

        const durationHours = durationMinutes / 60;
        const studentCount = studentIds.length;

        let hourlySchoolRate = isGroup ? (school.defaultGroupRate || school.defaultRate) : school.defaultRate;
        
        // UPDATED HERE: Check for school-specific teacher rate
        let hourlyTeacherRate = teacher.baseRate;
        if (teacher.ratesBySchool && teacher.ratesBySchool[school.id]) {
            hourlyTeacherRate = teacher.ratesBySchool[school.id];
        }
        // Override with group rate if it exists and type is group
        if (isGroup && teacher.baseGroupRate) {
            hourlyTeacherRate = teacher.baseGroupRate;
        }

        let schoolBill = hourlySchoolRate * durationHours * (isGroup ? studentCount : 1);
        let teacherPay = hourlyTeacherRate * durationHours * (isGroup ? studentCount : 1);

        if (status === LessonStatus.CANCELLED || status === LessonStatus.ABSENT_EXCUSED) {
            schoolBill = 0;
            teacherPay = 0;
        }

        const isCompleted = status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT;
        
        lessons.push({
          id: lessonId,
          date: lessonDate.toISOString(),
          teacherId: teacher.id,
          teacherName: teacher.name,
          studentIds,
          studentNames,
          schoolId: school.id,
          schoolName: school.name,
          status,
          durationMinutes,
          type,
          schoolRate: parseFloat(schoolBill.toFixed(2)),
          teacherRate: parseFloat(teacherPay.toFixed(2)),
          interactivity: isCompleted ? randomInt(3, 5) : 0,
          behavior: isCompleted ? randomInt(4, 5) : 0,
          learning: isCompleted ? `Mastering ${teacher.instrument} techniques.` : 'Lesson missed',
          notes: `Scenario: ${status} ${type} (${durationMinutes}m) at ${school.code}`
        });
    }
  }

  return { schools, teachers, users, students, lessons, lessonCounters: counters };
};
