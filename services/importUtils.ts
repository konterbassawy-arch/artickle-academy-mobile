
export const parseStudentExcel = async (file: File): Promise<any[]> => {
  return parseExcel(file);
};

export const parseLessonExcel = async (file: File): Promise<any[]> => {
  return parseExcel(file);
};

// Generic Excel Parser using SheetJS
const parseExcel = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          const data = e.target?.result;
          const XLSX = (window as any).XLSX;
          
          if (!XLSX) { 
              reject('SheetJS library not loaded. Please refresh the page.'); 
              return; 
          }
          
          try {
              // Use type 'array' for better compatibility with various formats including CSV/UTF-8
              const workbook = XLSX.read(data, { type: 'array' });

              // Find the first sheet that has actual data rows (not empty, not the Instructions sheet)
              let dataSheet = workbook.SheetNames[0];
              for (const name of workbook.SheetNames) {
                if (name === 'Instructions') continue;
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name]);
                if (rows.length > 0) { dataSheet = name; break; }
              }

              const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[dataSheet]);
              resolve(jsonData);
          } catch (err) {
              reject('Failed to parse Excel file.');
          }
      };
      reader.onerror = (err) => reject(err);
      // readAsArrayBuffer handles text encodings and binary formats better for the library
      reader.readAsArrayBuffer(file);
  });
};
