// Bundled export libraries.
//
// These were previously loaded from CDN <script> tags in index.html, which exposed them as
// globals: window.jspdf.jsPDF, window.XLSX and window.JSZip. Fetching code at runtime breaks
// offline launch and is rejected by the App Store (guideline 2.5.2), so we now install the
// packages via npm and let Vite bundle them into the app.
//
// To avoid touching the ~40 existing call sites, we re-attach the libraries to window in the
// exact shape the CDN builds used. Importing this module once at app startup (see index.tsx)
// runs before any export action, so every `(window as any).XLSX` / `.jspdf` / `.JSZip` access
// keeps working unchanged — the only difference is the code now ships inside the bundle.
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

(window as any).jspdf = { jsPDF };
(window as any).XLSX = XLSX;
(window as any).JSZip = JSZip;
