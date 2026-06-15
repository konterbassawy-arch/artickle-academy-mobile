/**
 * generateAIReport — Phase AI.2
 *
 * Minimal Firebase Cloud Function proxy. Receives a pre-built prompt from the
 * client and forwards it to Claude. The client never touches the API key.
 *
 * Setup:
 *   1. firebase functions:secrets:set ANTHROPIC_API_KEY
 *   2. firebase deploy --only functions
 *
 * Request body: { system: string, user: string, reportType: string }
 * Response:     { text: string }
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';
import corsLib from 'cors';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

admin.initializeApp();

const cors = corsLib({ origin: true });
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const gmailUser = defineSecret('BACKUP_GMAIL_USER');
const gmailAppPassword = defineSecret('BACKUP_GMAIL_APP_PASSWORD');
const backupEmailTo = defineSecret('BACKUP_EMAIL_TO');

export const generateAIReport = onRequest(
  { secrets: [anthropicApiKey], minInstances: 1 },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { system, user, reportType } = req.body as {
        system?: string;
        user?: string;
        reportType?: string;
      };

      if (!system || !user || !reportType) {
        res.status(400).json({ error: 'Missing required fields: system, user, reportType' });
        return;
      }

      const apiKey = anthropicApiKey.value();
      if (!apiKey) {
        res.status(500).json({ error: 'API key not configured' });
        return;
      }

      try {
        const client = new Anthropic({ apiKey });
        const message = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: user }],
        });

        const content = message.content[0];
        const text = content.type === 'text' ? content.text : '';
        res.json({ text });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(502).json({ error: `Claude API error: ${message}` });
      }
    });
  }
);

// ---------------------------------------------------------------------------
// Daily Firestore backup → gs://artickle-academy-backups/<YYYY-MM-DD>
// Runs at 02:00 UTC every day via Cloud Scheduler.
// The GCE metadata server provides the OAuth token (no extra dependencies).
// ---------------------------------------------------------------------------
const PROJECT_ID = 'artickle-academy';
const BACKUP_BUCKET = 'gs://artickle-academy-backups';


export const scheduledFirestoreBackup = onSchedule(
  { schedule: '55 22 * * *', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    // Get OAuth token from the instance metadata server
    const tokenRes = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } }
    );
    if (!tokenRes.ok) throw new Error(`Metadata token fetch failed: ${tokenRes.status}`);
    const { access_token: accessToken } = await tokenRes.json() as { access_token: string };

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const outputUri = `${BACKUP_BUCKET}/${date}`;

    const exportRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ outputUriPrefix: outputUri }),
      }
    );

    if (!exportRes.ok) {
      const body = await exportRes.text();
      throw new Error(`Firestore export failed (${exportRes.status}): ${body}`);
    }

    const operation = await exportRes.json();
    console.log(`Backup initiated → ${outputUri}`, JSON.stringify(operation));
  }
);

// ---------------------------------------------------------------------------
// Daily Excel export → gs://artickle-academy-backups/excel/<YYYY-MM-DD>.xlsx
// Runs at 02:05 UTC (5 min after the Firestore backup, same day).
// Produces one .xlsx workbook with a sheet per collection, emails a download link.
//
// Setup (one-time):
//   firebase functions:secrets:set BACKUP_GMAIL_USER         ← your Gmail address
//   firebase functions:secrets:set BACKUP_GMAIL_APP_PASSWORD ← Gmail App Password
//   firebase functions:secrets:set BACKUP_EMAIL_TO           ← where to send the report
// ---------------------------------------------------------------------------


export const dailyExcelExport = onSchedule(
  {
    schedule: '0 23 * * *',
    timeZone: 'UTC',
    region: 'us-central1',
    secrets: [gmailUser, gmailAppPassword, backupEmailTo],
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket('artickle-academy-backups');
    const date = new Date().toISOString().slice(0, 10);

    // ── 1. Fetch ALL top-level collections in parallel ─────────────────────
    const TOP_LEVEL = [
      'lessons', 'students', 'teachers', 'schools', 'users', 'parents',
      'bookings', 'timetableSlots', 'enrollments', 'schoolEnrollmentPeriods',
      'invoices', 'payments', 'payrollRuns', 'counters',
    ];
    const snaps = await Promise.all(TOP_LEVEL.map(c => db.collection(c).get()));
    const rawData: Record<string, Record<string, unknown>[]> = {};
    for (let i = 0; i < TOP_LEVEL.length; i++) {
      rawData[TOP_LEVEL[i]] = snaps[i].docs.map(d => ({ _id: d.id, ...d.data() }));
    }

    // ── 2. Fetch students/{id}/aiReports subcollection ─────────────────────
    const studentDocs = snaps[TOP_LEVEL.indexOf('students')].docs;
    const aiReportsByStudent: Record<string, unknown>[] = [];
    await Promise.all(studentDocs.map(async (studentDoc) => {
      const reportsSnap = await db
        .collection('students').doc(studentDoc.id)
        .collection('aiReports').get();
      reportsSnap.docs.forEach(r => {
        aiReportsByStudent.push({ _id: r.id, studentId: studentDoc.id, ...r.data() });
      });
    }));
    rawData['students_aiReports'] = aiReportsByStudent;

    // ── 3. Build the human-readable Excel workbook ─────────────────────────
    const wb = XLSX.utils.book_new();

    // Helper: flatten nested objects for Excel readability
    const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
      return Object.entries(obj).reduce((acc, [k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
          Object.assign(acc, flatten(v as Record<string, unknown>, key));
        } else if (Array.isArray(v)) {
          acc[key] = v.join(' | ');
        } else {
          acc[key] = v;
        }
        return acc;
      }, {} as Record<string, unknown>);
    };

    const excelSheets: { name: string; count: number }[] = [];
    const sheetOrder = [
      ['Lessons', 'lessons'],
      ['Students', 'students'],
      ['Teachers', 'teachers'],
      ['Schools', 'schools'],
      ['Users', 'users'],
      ['Parents', 'parents'],
      ['Bookings', 'bookings'],
      ['Timetable', 'timetableSlots'],
      ['Enrollments', 'enrollments'],
      ['School Periods', 'schoolEnrollmentPeriods'],
      ['Invoices', 'invoices'],
      ['Payments', 'payments'],
      ['Payroll', 'payrollRuns'],
      ['AI Reports', 'students_aiReports'],
    ];

    for (const [sheetName, colKey] of sheetOrder) {
      const rows = (rawData[colKey] || []).map(r => flatten(r as Record<string, unknown>));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      excelSheets.push({ name: sheetName, count: rows.length });
    }
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // ── 4. Build the full JSON zip (every field, exact Firestore structure) ─
    const zip = new JSZip();
    for (const [colName, docs] of Object.entries(rawData)) {
      zip.file(`${colName}.json`, JSON.stringify(docs, null, 2));
    }
    // Add a manifest so I can verify completeness on restore
    zip.file('_manifest.json', JSON.stringify({
      exportDate: date,
      exportedAt: new Date().toISOString(),
      collections: Object.fromEntries(
        Object.entries(rawData).map(([k, v]) => [k, v.length])
      ),
    }, null, 2));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    // ── 5. Save both to GCS ────────────────────────────────────────────────
    await Promise.all([
      bucket.file(`excel/${date}.xlsx`).save(xlsxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      bucket.file(`json/${date}.zip`).save(zipBuffer, { contentType: 'application/zip' }),
    ]);

    // ── 6. Send email with both attachments ────────────────────────────────
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser.value(), pass: gmailAppPassword.value() },
    });

    const tableRows = excelSheets.map(s =>
      `<tr><td style="padding:5px 12px">${s.name}</td><td style="padding:5px 12px;text-align:center">${s.count}</td></tr>`
    ).join('');

    await transporter.sendMail({
      from: `ARTickle Academy Backup <${gmailUser.value()}>`,
      to: backupEmailTo.value(),
      subject: `📦 ARTickle Academy Backup — ${date}`,
      attachments: [
        {
          filename: `${date}.xlsx`,
          content: xlsxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        {
          filename: `artickle-restore-${date}.zip`,
          content: zipBuffer,
          contentType: 'application/zip',
        },
      ],
      html: `
        <h2 style="font-family:sans-serif">Daily Backup — ${date}</h2>
        <p style="font-family:sans-serif">Two files are attached:</p>
        <ul style="font-family:sans-serif">
          <li><strong>${date}.xlsx</strong> — human-readable, open in Excel</li>
          <li><strong>artickle-restore-${date}.zip</strong> — full JSON backup of every collection.
              If something goes wrong, forward this email and Claude can restore everything.</li>
        </ul>
        <table style="font-family:sans-serif;border-collapse:collapse;border:1px solid #ddd;margin-top:12px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px 12px;text-align:left">Collection</th>
              <th style="padding:8px 12px">Records</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="font-family:sans-serif;color:#888;font-size:12px;margin-top:24px">
          Raw Firestore export also saved to gs://artickle-academy-backups/${date}/
        </p>
      `,
    });

    console.log(`Backup complete for ${date}. Excel: ${xlsxBuffer.length} bytes, ZIP: ${zipBuffer.length} bytes`);
  }
);
