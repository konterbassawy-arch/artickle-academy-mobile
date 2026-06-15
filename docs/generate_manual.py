"""
ARTickle Academy — Teacher & School Admin User Manual Generator
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
import os

# ── Colours ──────────────────────────────────────────────────────────────────
DARK_BG   = colors.HexColor("#0f172a")
PRIMARY   = colors.HexColor("#6366f1")   # indigo / brand
ACCENT    = colors.HexColor("#f59e0b")   # amber
GREEN     = colors.HexColor("#10b981")
BLUE      = colors.HexColor("#3b82f6")
RED       = colors.HexColor("#ef4444")
SLATE_500 = colors.HexColor("#64748b")
SLATE_300 = colors.HexColor("#cbd5e1")
WHITE     = colors.white
LIGHT_BG  = colors.HexColor("#f8fafc")
SECTION_BG= colors.HexColor("#eef2ff")   # light indigo

OUTPUT = os.path.join(os.path.dirname(__file__), "ARTickle_Academy_User_Manual.pdf")

# ── Styles ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

TITLE_STYLE = ParagraphStyle(
    "ManualTitle",
    parent=styles["Title"],
    fontSize=28,
    textColor=WHITE,
    spaceAfter=6,
    alignment=TA_CENTER,
    fontName="Helvetica-Bold",
)
SUBTITLE_STYLE = ParagraphStyle(
    "ManualSubtitle",
    parent=styles["Normal"],
    fontSize=13,
    textColor=SLATE_300,
    alignment=TA_CENTER,
    spaceAfter=4,
)
H1 = ParagraphStyle(
    "H1",
    parent=styles["Heading1"],
    fontSize=20,
    textColor=WHITE,
    fontName="Helvetica-Bold",
    spaceAfter=6,
    spaceBefore=2,
)
H2 = ParagraphStyle(
    "H2",
    parent=styles["Heading2"],
    fontSize=14,
    textColor=PRIMARY,
    fontName="Helvetica-Bold",
    spaceAfter=4,
    spaceBefore=10,
)
H3 = ParagraphStyle(
    "H3",
    parent=styles["Heading3"],
    fontSize=11,
    textColor=ACCENT,
    fontName="Helvetica-Bold",
    spaceAfter=3,
    spaceBefore=6,
)
BODY = ParagraphStyle(
    "Body",
    parent=styles["Normal"],
    fontSize=10,
    textColor=colors.HexColor("#1e293b"),
    leading=15,
    spaceAfter=4,
    alignment=TA_JUSTIFY,
)
BULLET = ParagraphStyle(
    "Bullet",
    parent=BODY,
    leftIndent=14,
    bulletIndent=4,
    spaceAfter=3,
)
NOTE = ParagraphStyle(
    "Note",
    parent=BODY,
    fontSize=9,
    textColor=SLATE_500,
    leftIndent=10,
    fontName="Helvetica-Oblique",
)
CODE = ParagraphStyle(
    "Code",
    parent=styles["Code"],
    fontSize=9,
    textColor=colors.HexColor("#1e293b"),
    backColor=colors.HexColor("#f1f5f9"),
    leftIndent=10,
    borderPad=4,
)

def b(text):
    return f"<b>{text}</b>"

def bullet_item(text):
    return Paragraph(f"• {text}", BULLET)

def note(text):
    return Paragraph(f"ℹ {text}", NOTE)

def spacer(h=0.25):
    return Spacer(1, h * cm)


# ── Cover page background ─────────────────────────────────────────────────────
class CoverTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height,
            id="normal"
        )
        template = PageTemplate(id="cover", frames=[frame], onPage=self._draw_cover)
        content_template = PageTemplate(id="content", frames=[frame], onPage=self._draw_content)
        self.addPageTemplates([template, content_template])

    def _draw_cover(self, c, doc):
        w, h = A4
        # Dark background
        c.setFillColor(DARK_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # Accent bar top
        c.setFillColor(PRIMARY)
        c.rect(0, h - 0.8*cm, w, 0.8*cm, fill=1, stroke=0)
        # Bottom bar
        c.setFillColor(ACCENT)
        c.rect(0, 0, w, 0.5*cm, fill=1, stroke=0)
        # Subtle grid pattern
        c.setStrokeColor(colors.HexColor("#1e293b"))
        c.setLineWidth(0.3)
        for x in range(0, int(w)+40, 40):
            c.line(x, 0, x, h)
        for y in range(0, int(h)+40, 40):
            c.line(0, y, w, y)

    def _draw_content(self, c, doc):
        w, h = A4
        # Light background
        c.setFillColor(LIGHT_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # Left sidebar accent
        c.setFillColor(PRIMARY)
        c.rect(0, 0, 0.35*cm, h, fill=1, stroke=0)
        # Footer
        c.setFillColor(SLATE_500)
        c.setFont("Helvetica", 8)
        c.drawString(2*cm, 0.9*cm, "ARTickle Academy — Confidential User Manual")
        c.drawRightString(w - 2*cm, 0.9*cm, f"Page {doc.page}")


# ── Build content ─────────────────────────────────────────────────────────────
def build_manual():
    doc = CoverTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=2.2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    story = []

    # ── COVER ─────────────────────────────────────────────────────────────────
    story.append(spacer(6))
    story.append(Paragraph("ARTickle Academy", TITLE_STYLE))
    story.append(spacer(0.3))
    story.append(Paragraph("Management Platform", SUBTITLE_STYLE))
    story.append(spacer(0.5))
    story.append(Paragraph("User Manual for Teachers &amp; School Admins", ParagraphStyle(
        "CoverSub2", parent=SUBTITLE_STYLE, fontSize=11, textColor=ACCENT
    )))
    story.append(spacer(1.5))
    # Divider
    story.append(HRFlowable(width="60%", thickness=1, color=PRIMARY, hAlign="CENTER"))
    story.append(spacer(1))
    story.append(Paragraph("Version 1.0  ·  April 2026", ParagraphStyle(
        "Version", parent=SUBTITLE_STYLE, fontSize=9, textColor=SLATE_500
    )))

    # Switch to content template
    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())

    # ── TABLE OF CONTENTS ─────────────────────────────────────────────────────
    toc_title = ParagraphStyle("TOCTitle", parent=H1, textColor=PRIMARY, fontSize=18)
    story.append(Paragraph("Table of Contents", toc_title))
    story.append(spacer(0.3))
    toc_items = [
        ("Part 1", "Teacher Guide", ""),
        ("1.1", "Dashboard", ""),
        ("1.2", "My Students", ""),
        ("1.3", "Take Attendance", ""),
        ("1.4", "Lesson Log", ""),
        ("1.5", "My Bookings", ""),
        ("1.6", "My Weekly Schedule", ""),
        ("1.7", "My Payroll", ""),
        ("1.8", "My Earnings (Finance)", ""),
        ("1.9", "My Profile", ""),
        ("1.10", "Reports", ""),
        ("Part 2", "School Admin Guide", ""),
        ("2.1", "Dashboard", ""),
        ("2.2", "School Lessons", ""),
        ("2.3", "Students", ""),
        ("2.4", "School Periods", ""),
        ("2.5", "Invoices", ""),
        ("2.6", "Reports", ""),
        ("Part 3", "Common Features &amp; Tips", ""),
    ]
    toc_data = []
    for num, title, pg in toc_items:
        is_part = num.startswith("Part")
        toc_data.append([
            Paragraph(f"<b>{num}</b>" if is_part else num,
                      ParagraphStyle("TOCNum", parent=BODY, fontSize=10 if is_part else 9,
                                     textColor=PRIMARY if is_part else SLATE_500)),
            Paragraph(f"<b>{title}</b>" if is_part else title,
                      ParagraphStyle("TOCTitle", parent=BODY, fontSize=10 if is_part else 9,
                                     textColor=colors.HexColor("#1e293b"))),
        ])
    toc_table = Table(toc_data, colWidths=[2*cm, 14*cm])
    toc_table.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("LINEBELOW", (0,0), (-1,-1), 0.3, colors.HexColor("#e2e8f0")),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # PART 1 — TEACHER GUIDE
    # ══════════════════════════════════════════════════════════════════════════
    part_style = ParagraphStyle("Part", parent=H1, fontSize=22, textColor=WHITE,
                                 backColor=PRIMARY, borderPad=10, leading=28)
    story.append(Paragraph("Part 1 — Teacher Guide", part_style))
    story.append(spacer(0.5))
    story.append(Paragraph(
        "This section explains every tab and feature available to teachers in ARTickle Academy. "
        "Teachers access the platform at <b>/teacher</b> after signing in.",
        BODY
    ))
    story.append(spacer(0.4))

    # ── 1.1 Dashboard ─────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.1  Dashboard", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The Dashboard is the first screen you see after logging in. It gives you an at-a-glance "
            "summary of your teaching activity for the current week and month.",
            BODY
        ),
    ]))

    story.append(Paragraph("What you can see:", H3))
    for item in [
        (b("Lessons card") + " — Total number of lessons in the current week view. Click it to go to the full lesson list.", ),
        (b("Attendance % card") + " — Percentage of your lessons marked as Present or Taught versus total lessons.", ),
        (b("My Earnings card") + " — Your total payroll earnings for the current month (in SAR). Includes any guarantee adjustments.", ),
        (b("Week Timeline table") + " — A scrollable table showing up to 50 of your lessons: date, time, student, school, and status. "
            "Click any row to open the lesson detail view.", ),
        (b("Unread admin notes banner") + " — If the academy admin has left a note on one of your lessons, a red banner appears at the top. "
            "Click <i>View in Lesson Log</i> to jump directly to those lessons.", ),
    ]:
        story.append(bullet_item(item[0]))

    story.append(Paragraph("What you can do:", H3))
    for item in [
        "Click any lesson row to open its full detail (student evaluation, notes, status).",
        "Click <b>Edit</b> on any row to update that lesson's status, evaluation scores, or notes.",
        "Watch the red pulsing dot — it means the admin left a note requiring your attention.",
    ]:
        story.append(bullet_item(item))
    story.append(spacer(0.3))

    # ── 1.2 My Students ────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.2  My Students", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "This page shows every student assigned to you. You can add new students, search and filter "
            "your roster, and export or import student records.",
            BODY
        ),
    ]))

    story.append(Paragraph("Adding a new student:", H3))
    for item in [
        b("Student Name") + " — Full name of the student (required).",
        b("School") + " — Select the school from the dropdown. If the school doesn't exist yet, click <b>+ New</b> "
            "to create it on the spot (requires a 2-letter uppercase school code, e.g. KC).",
        b("Instrument") + " — Pre-filled with your instrument but editable (required).",
        b("Year / Grade") + " — Optional. Grade 1–12 for filtering and reports.",
        b("Email") + " — Optional. Student's or parent's email address.",
        b("Date of Birth") + " — Optional. Used for age records.",
        "Click <b>Add Student</b> to save.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Filtering &amp; searching:", H3))
    for item in [
        b("Grade dropdown") + " — Show only students in a specific year/grade.",
        b("Search box") + " — Live search across student name, instrument, and email.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Import &amp; Export:", H3))
    for item in [
        b("Export button") + " — Downloads your students as an Excel (.xlsx) file. Useful for record-keeping.",
        b("Import button") + " — Upload an Excel file to bulk-add students. Follow the template format "
            "(instructions are included in the exported file as a second sheet).",
    ]:
        story.append(bullet_item(item))

    story.append(note(
        "Click any student row to open their full profile — lesson history, attendance rate, "
        "enrollment periods, and evaluation details."
    ))
    story.append(spacer(0.3))

    # ── 1.3 Take Attendance ────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.3  Take Attendance", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "This is the primary data-entry form for recording lessons. After each class, fill in this "
            "form to log what happened, evaluate the student, and save the record.",
            BODY
        ),
    ]))

    story.append(Paragraph("Section 1 — Lesson Details:", H3))
    rows = [
        ["Field", "Description"],
        ["Date & Time", "Auto-filled to now. Change it if logging a past lesson."],
        ["School", "Select the school where the lesson took place."],
        ["Student", "Select your student (list is filtered to the chosen school)."],
        ["Type", "Individual or Group lesson."],
        ["Delivery Mode", "In-Person or Online."],
        ["Status", "Present · Absent (Excused) · Absent (Unexcused) · Cancelled. "
                   "Cancelled and Absent (Excused) record 0 earnings."],
        ["Duration", "Lesson length in minutes (e.g. 30, 45, 60)."],
    ]
    t = Table(rows, colWidths=[4*cm, 12*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(t)
    story.append(spacer(0.3))

    story.append(Paragraph("Section 2 — Evaluation (required for attended lessons):", H3))
    for item in [
        b("Effort (1–5 stars)") + " — How much effort the student put in during the lesson. Required.",
        b("Practice (1–5 stars)") + " — How well the student practiced since the last lesson. Required.",
        b("What did the student learn?") + " — Free text: scales, pieces, theory concepts, etc. "
            "Use the <b>AI Rewrite</b> button to polish your wording automatically.",
        b("Overall Grade / Level") + " — e.g. Grade 3, Beginner, Intermediate.",
        b("Exam Prep Status") + " — Not started · Preparing · Ready · Completed.",
        b("Repertoire / Piece Being Studied") + " — The piece or song currently worked on.",
        b("Practice Assignment / Homework") + " — What the student should practice before the next lesson.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Section 3 — Private Notes:", H3))
    story.append(bullet_item(
        b("Private Notes") + " — Internal notes visible only to teachers and admins. "
        "Not shown to parents or on reports. Use the AI Rewrite button to refine text."
    ))
    story.append(note("If you try to save without Effort or Practice ratings on an attended lesson, the form scrolls to the evaluation section and highlights the missing fields in red."))
    story.append(note("After saving, a blue animated confirmation screen appears briefly, then the form resets so you can immediately log the next lesson."))
    story.append(spacer(0.3))

    # ── 1.4 Lesson Log ─────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.4  Lesson Log", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The Lesson Log is a full searchable history of all your lessons. You can filter, edit, "
            "add new lessons inline, and export records.",
            BODY
        ),
    ]))

    story.append(Paragraph("Filtering options:", H3))
    for item in [
        b("Search box") + " — Search by student name, teacher name, or lesson ID.",
        b("Date range") + " — Set a start and/or end date to scope results.",
        b("Status filter") + " — Filter by Present, Taught, Absent (Excused/Unexcused), or Cancelled.",
        b("Unread notes filter") + " — Show only lessons that have unread admin notes (also triggered by ?unread=1 URL).",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Actions per lesson:", H3))
    for item in [
        b("Click any row") + " — Opens a read-only detail popup showing all evaluation fields, notes, and status.",
        b("Edit button") + " — Opens a full edit form where you can change status, ratings, notes, and all evaluation fields.",
        b("Delete") + " — Admin-only. Teachers see the Edit button only.",
        b("Add Lesson (+ button)") + " — Opens the Attendance form inline to log a new lesson without leaving the page.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Export:", H3))
    story.append(bullet_item(
        b("Export Excel") + " — Downloads all filtered lessons as an Excel file. "
        "Includes date, student, school, type, status, duration, and teacher evaluation fields."
    ))
    story.append(note("The red pulsing dot next to a lesson row means there is an unread admin note on that lesson. Open the lesson to read and dismiss it."))
    story.append(spacer(0.3))

    # ── 1.5 My Bookings ────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.5  My Bookings", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "Shows all booking requests that have been assigned to you by the admin. "
            "This is a read-only view — teachers cannot create or modify bookings.",
            BODY
        ),
    ]))

    story.append(Paragraph("What you can see per booking:", H3))
    for item in [
        b("Student name &amp; instrument"),
        b("Lesson type") + " — Trial or Regular.",
        b("Duration") + " — in minutes.",
        b("School") + " — where the lesson will take place.",
        b("Requested date") + " — the preferred date/time from the booking request.",
        b("Requested by") + " — which parent or staff member made the request.",
        b("Notes") + " — any notes from the requester (shown in italics).",
        b("Status badge") + " — Pending · Approved · Converted · Rejected · Cancelled.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Status meanings:", H3))
    status_rows = [
        ["Status", "Meaning"],
        ["Pending", "The request is awaiting admin review."],
        ["Approved", "Admin approved it — waiting to be converted into a scheduled lesson."],
        ["Converted", "The booking has been turned into a lesson on the timetable."],
        ["Rejected", "Admin declined the booking."],
        ["Cancelled", "The request was cancelled."],
    ]
    st = Table(status_rows, colWidths=[3.5*cm, 12.5*cm])
    st.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(st)
    story.append(note("Use the Status filter dropdown at the top to show only active (Pending/Approved) bookings."))
    story.append(spacer(0.3))

    # ── 1.6 My Weekly Schedule ─────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.6  My Weekly Schedule", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "A read-only view of your recurring weekly timetable as configured by the admin. "
            "This shows your fixed lesson slots — not individual lesson records.",
            BODY
        ),
    ]))

    story.append(Paragraph("What you can see:", H3))
    for item in [
        b("Active slots grouped by day") + " — Each day of the week that has scheduled slots appears as a card.",
        b("Per-slot details") + " — Start time, end time, student name(s), school, duration, lesson type (Individual/Group), delivery mode (In-Person/Online), and instrument.",
        b("Slot notes") + " — Any extra note the admin added to the slot (shown in italic below the slot).",
        b("Paused slots section") + " — Slots the admin has temporarily disabled appear dimmed at the bottom.",
    ]:
        story.append(bullet_item(item))

    story.append(note("You cannot edit your schedule from this page. Contact your admin to add, change, or pause slots."))
    story.append(spacer(0.3))

    # ── 1.7 My Payroll ─────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.7  My Payroll", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "Shows the payroll runs the admin has created for you — official pay periods with "
            "totals, payment status, and a line-by-line breakdown of what you earned.",
            BODY
        ),
    ]))

    story.append(Paragraph("Summary cards at the top:", H3))
    for item in [
        b("Active Runs") + " — Count of payroll runs that are Approved, Partially Paid, or Paid.",
        b("Total Earned") + " — Sum of totalPayable across all active runs.",
        b("Received") + " — Amount already paid to you.",
        b("Pending") + " — Outstanding balance still owed to you (highlighted in amber if > 0).",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Payroll table columns:", H3))
    for item in [
        b("Payroll #") + " — Unique reference number for the run.",
        b("Period") + " — The date range covered (e.g. 01 Mar 2026 – 31 Mar 2026).",
        b("Total") + " — Full payable amount for the period.",
        b("Paid") + " — Amount received so far.",
        b("Balance") + " — Remaining amount owed.",
        b("Status") + " — Draft · Approved · Partial · Paid · Cancelled.",
        b("View button") + " — Opens a detailed breakdown modal.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Line-item detail modal:", H3))
    for item in [
        "Shows each lesson individually: date, description, hours, hourly rate, and amount.",
        b("Type") + " — <i>lesson</i> (regular lesson), <i>guarantee</i> (minimum-hour top-up), or <i>manual</i> (admin adjustment).",
        "Guarantee rows appear in amber — these are payments added because your actual hours were below the minimum guaranteed hours for that school day.",
    ]:
        story.append(bullet_item(item))
    story.append(note("Payroll is prepared by the admin. You cannot request or edit payroll runs from this page."))
    story.append(spacer(0.3))

    # ── 1.8 My Earnings (Finance) ──────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.8  My Earnings (Finance)", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "A personal financial calculator that lets you see exactly what you earned in any "
            "month, broken down lesson by lesson, including guarantee adjustments.",
            BODY
        ),
    ]))

    story.append(Paragraph("How to use:", H3))
    for item in [
        "Select the <b>Year</b> and <b>Month</b> from the two dropdowns at the top right.",
        "The three summary cards update instantly: <b>Total Earnings</b>, <b>Hours Taught</b>, and <b>Lesson Count</b>.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Guarantee adjustments section:", H3))
    story.append(bullet_item(
        "If you had a school day where your actual teaching hours fell below the school's "
        "minimum guarantee, the shortfall is shown here as an amber panel with the date, school, "
        "actual hours vs minimum, and the extra amount added to your earnings."
    ))

    story.append(Paragraph("Detailed breakdown table:", H3))
    for item in [
        b("Date") + " — Lesson date.",
        b("School") + " — Where the lesson was held.",
        b("Student") + " — Student taught.",
        b("Type") + " — Individual or Group badge.",
        b("Hours") + " — Duration converted to hours.",
        b("Rate") + " — Effective hourly rate in SAR.",
        b("Earnings") + " — Amount earned for that lesson (amber).",
    ]:
        story.append(bullet_item(item))
    story.append(note("Cancelled and Absent (Excused) lessons appear dimmed with 0 SAR — they do not count towards your earnings."))
    story.append(spacer(0.3))

    # ── 1.9 My Profile ─────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.9  My Profile", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "A read-only view of your teacher record. Shows your personal details, pay rates, "
            "and any minimum-hour guarantees configured for you.",
            BODY
        ),
    ]))

    story.append(Paragraph("Sections:", H3))
    for item in [
        b("Personal Information") + " — Your name, teacher code, instrument, and login email.",
        b("My Rates") + " — Your base Individual rate (SAR/hr) and Group rate (SAR/hr). "
            "If the admin has set school-specific overrides for you, they appear in a table below.",
        b("Daily Minimum Guarantee") + " — If the admin has configured a minimum teaching hours "
            "guarantee per instrument per school day, the details are shown here (hours/day and whether active).",
    ]:
        story.append(bullet_item(item))
    story.append(note("To change any profile information or rates, contact your admin — teachers cannot edit their own profile."))
    story.append(spacer(0.3))

    # ── 1.10 Reports ───────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("1.10  Reports", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The Reports page lets you generate and download bulk data exports covering lessons, "
            "attendance, and student progress across any date range.",
            BODY
        ),
    ]))
    story.append(Paragraph("What you can do:", H3))
    for item in [
        "Select a date range and generate a full Excel report of your lessons.",
        "Filter by school or student to narrow the export.",
        "Download the file for your own records or to share with parents.",
    ]:
        story.append(bullet_item(item))
    story.append(note("The teacher Reports view is export-only — you cannot modify any records from this page."))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # PART 2 — SCHOOL ADMIN GUIDE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 2 — School Admin Guide", part_style))
    story.append(spacer(0.5))
    story.append(Paragraph(
        "School Admins see only data belonging to their own school. Teacher pay rates, "
        "admin-only notes, and financial details are not visible to school admins. "
        "School Admins access the platform at <b>/school</b> after signing in.",
        BODY
    ))
    story.append(spacer(0.4))

    # ── 2.1 Dashboard ─────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("2.1  Dashboard", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The School Admin Dashboard gives a real-time snapshot of your school's music "
            "programme for the current month.",
            BODY
        ),
    ]))

    story.append(Paragraph("Summary cards:", H3))
    for item in [
        b("Students") + " — Total number of enrolled students at your school.",
        b("Total Lessons") + " — All-time lesson count for your school.",
        b("[Month] Lessons") + " — Number of completed (non-cancelled) lessons this calendar month.",
        b("[Month] Hours") + " — Total teaching hours delivered this month.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Recent Classes table:", H3))
    for item in [
        "Shows the last 20 lessons at your school, sorted newest first.",
        "Columns: Date, Teacher, Student(s), Lesson Type, Duration, Status.",
        "Click any row to open the lesson detail popup.",
        b("+ Add School Comment button") + " in the detail popup opens an edit form where you can add two kinds of comments to a lesson.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Adding comments to a lesson (from the dashboard or lesson list):", H3))
    rows2 = [
        ["Comment Field", "Visibility", "Purpose"],
        ["School Teacher Comment",
         "Appears on the lesson PDF sent to parents",
         "Use this to add your school's feedback on the lesson for the student/parent."],
        ["Internal Comment",
         "Internal only — never visible to parents or on PDFs",
         "Use this for internal tracking notes (e.g. student behaviour, admin follow-ups)."],
    ]
    t2 = Table(rows2, colWidths=[4.2*cm, 4.2*cm, 7.6*cm])
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(t2)
    story.append(note("From the dashboard lesson popup you can also click Download PDF to generate a single-lesson PDF report for the parent."))
    story.append(spacer(0.3))

    # ── 2.2 School Lessons ─────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("2.2  School Lessons", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The full lesson history for your school with powerful filtering, "
            "bulk export, and per-lesson comment editing and PDF generation.",
            BODY
        ),
    ]))

    story.append(Paragraph("Filter row 1 — Search &amp; quick filters:", H3))
    for item in [
        b("Search box") + " — Search by teacher name, student name, or lesson ID.",
        b("Month dropdown") + " — Show only lessons in a specific month.",
        b("Status dropdown") + " — Filter by Present, Taught, Absent (Excused), Absent (Unexcused), or Cancelled.",
        b("School Period dropdown") + " — If your school has enrollment periods configured, filter lessons to a specific term/semester.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Filter row 2 — Date range:", H3))
    story.append(bullet_item(b("From / To date pickers") + " — Fine-grained date range filter. Clears the month dropdown automatically."))

    story.append(Paragraph("Filter row 3 — Student cross-reference:", H3))
    for item in [
        b("Grade dropdown") + " — Show only lessons involving students in a specific grade.",
        b("Email search") + " — Filter lessons involving a student whose email matches the search.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Actions per lesson:", H3))
    for item in [
        b("Click a row") + " — Opens the lesson detail popup (read-only).",
        b("Edit button") + " — Opens the school comment editor (School Teacher Comment + Internal Comment).",
        b("PDF button") + " — Generates and downloads a single-lesson PDF report suitable for parents.",
        b("Checkbox") + " — Select individual lessons for a bulk export.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Export:", H3))
    story.append(bullet_item(
        b("Export Excel button") + " — Downloads the currently filtered lesson list as Excel. "
        "If checkboxes are selected, only those lessons are exported. "
        "Financial columns (school billing rates, teacher pay) are not included."
    ))
    story.append(note("Billing amounts (SAR) are not shown in the School Lessons view — contact your account manager for financial statements."))
    story.append(spacer(0.3))

    # ── 2.3 Students ───────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("2.3  Students", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "A read-only roster of all students enrolled at your school. You can filter and "
            "search, and click a student to see their full lesson history and evaluation timeline.",
            BODY
        ),
    ]))

    story.append(Paragraph("What you can see per student:", H3))
    for item in [
        b("Name") + " — Student's full name (clickable to open detail).",
        b("Instrument") + " — The instrument they study.",
        b("Teacher") + " — Assigned teacher.",
        b("Lesson Count") + " — Total lessons recorded for this student.",
        b("Enrollment") + " — Active school enrollment period badges.",
        b("Grade") + " — Year/grade level.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Filtering:", H3))
    for item in [
        b("Grade dropdown") + " — Filter by grade level.",
        b("Search box") + " — Search across name, instrument, teacher, and email.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Student detail page:", H3))
    for item in [
        "Full lesson history for that student at your school.",
        "Attendance summary (present vs absent vs cancelled).",
        "Evaluation timeline — see how ratings and notes have changed over time.",
        "Enrollment period information.",
    ]:
        story.append(bullet_item(item))
    story.append(note("School Admins cannot add, edit, or delete students. Student records are managed by the academy admin."))
    story.append(spacer(0.3))

    # ── 2.4 School Periods ─────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("2.4  School Periods", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "School Periods (also called Enrollment Periods) define the terms or semesters your school uses. "
            "They let you filter lessons and student data by term.",
            BODY
        ),
    ]))
    story.append(Paragraph("What you can see:", H3))
    for item in [
        "A list of your school's defined periods, each with a name, start date, and end date.",
        "Active vs inactive status for each period.",
    ]:
        story.append(bullet_item(item))
    story.append(note("School Periods are created and managed by the academy admin, not by school admins. Contact your admin to add or modify periods."))
    story.append(spacer(0.3))

    # ── 2.5 Invoices ───────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("2.5  Invoices", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The Invoices page shows all invoices issued to your school by ARTickle Academy, "
            "along with payment status and history.",
            BODY
        ),
    ]))

    story.append(Paragraph("Summary cards:", H3))
    for item in [
        b("Total Invoices") + " — How many invoices exist for your school.",
        b("Outstanding") + " — Total unpaid balance across all active invoices (amber).",
        b("Paid") + " — Number of fully paid invoices.",
        b("Overdue") + " — Number of invoices past their due date.",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Invoice table:", H3))
    for item in [
        b("Invoice #") + " — Unique reference number.",
        b("Period") + " — Date range the invoice covers.",
        b("Amount") + " — Total billed amount.",
        b("Paid") + " — Amount received.",
        b("Balance") + " — Remaining due.",
        b("Due Date") + " — Payment deadline.",
        b("Status") + " — Draft · Issued · Partially Paid · Paid · Overdue · Cancelled.",
        b("Expand (▼)") + " — Click to see the payment history for that invoice (payment date, amount, method).",
    ]:
        story.append(bullet_item(item))

    story.append(Paragraph("Invoice statuses:", H3))
    inv_rows = [
        ["Status", "Meaning"],
        ["Draft", "Prepared but not yet sent to you."],
        ["Issued", "Officially sent — payment is now expected."],
        ["Partially Paid", "Some payment received, balance still owed."],
        ["Paid", "Fully settled. No balance due."],
        ["Overdue", "Past the due date with an unpaid balance."],
        ["Cancelled", "Invoice voided — no payment required."],
    ]
    it = Table(inv_rows, colWidths=[3.5*cm, 12.5*cm])
    it.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(it)
    story.append(note("School Admins cannot pay or modify invoices from the app. Contact your account manager to arrange payment."))
    story.append(spacer(0.3))

    # ── 2.6 Reports ────────────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("2.6  Reports", H2),
        HRFlowable(width="100%", thickness=0.5, color=PRIMARY),
        spacer(0.2),
        Paragraph(
            "The Reports page is an export-only tool that lets you download bulk lesson data "
            "for your school in Excel format.",
            BODY
        ),
    ]))
    story.append(Paragraph("What you can do:", H3))
    for item in [
        "Set a date range and generate an Excel export of all lessons at your school.",
        "Filter by teacher or status before exporting.",
        "Use the file for internal reporting, parent communication, or archiving.",
    ]:
        story.append(bullet_item(item))
    story.append(note("Financial columns (billing rates) are excluded from school admin exports."))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # PART 3 — COMMON FEATURES & TIPS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 3 — Common Features &amp; Tips", part_style))
    story.append(spacer(0.5))

    story.append(Paragraph("Lesson Statuses — Quick Reference", H2))
    HRFlowable(width="100%", thickness=0.5, color=PRIMARY)
    status_full_rows = [
        ["Status", "Icon colour", "Counts for earnings?", "When to use"],
        ["Present", "Green", "Yes", "Student attended and lesson was delivered."],
        ["Taught", "Green", "Yes", "Same as Present — alternate label used in some schools."],
        ["Absent (Excused)", "Amber", "No", "Student gave advance notice of absence."],
        ["Absent (Unexcused)", "Red/Amber", "Yes*", "Student did not show and gave no notice. Teacher still gets paid."],
        ["Cancelled", "Red", "No", "Lesson was cancelled by the school, teacher, or admin."],
    ]
    sft = Table(status_full_rows, colWidths=[3.5*cm, 2.8*cm, 3.2*cm, 6.5*cm])
    sft.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(sft)
    story.append(note("* Absent (Unexcused) counts towards teacher pay but not as a 'completed' lesson for attendance percentages."))
    story.append(spacer(0.4))

    story.append(Paragraph("AI Rewrite Button", H2))
    story.append(Paragraph(
        "Several text fields (What did the student learn, Repertoire, Practice Assignment, Private Notes) "
        "have a small <b>AI Rewrite</b> button next to the label. "
        "Clicking it sends your text to an AI model which rewrites it in clear, professional language. "
        "The rewritten text is automatically placed back in the field — you can then edit further or keep it as-is. "
        "Fields processed by AI are tagged internally so the system knows they were AI-assisted.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("Lesson PDFs", H2))
    story.append(Paragraph(
        "School admins can generate a per-lesson PDF report from the Lessons page or the Dashboard. "
        "The PDF includes: lesson date &amp; time, teacher name, student name, status, duration, "
        "and the <b>School Teacher Comment</b> field (if filled in). "
        "It does <b>not</b> include teacher pay rates, internal admin notes, or billing amounts.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("Data Privacy — What Each Role Can See", H2))
    privacy_rows = [
        ["Data", "Teacher", "School Admin"],
        ["Own lesson details", "Full access", "Full access (their school)"],
        ["Teacher pay rates", "Own rates only", "Not visible"],
        ["School billing rates (SAR)", "Not visible", "Not visible"],
        ["Admin internal notes", "Not visible", "Not visible"],
        ["Other teachers' pay", "Not visible", "Not visible"],
        ["Student personal info", "Own students", "All school students"],
        ["Invoice amounts", "Not visible", "Own school invoices"],
        ["Payroll runs", "Own payroll only", "Not visible"],
    ]
    pt = Table(privacy_rows, colWidths=[6*cm, 4.5*cm, 5.5*cm])
    pt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(pt)
    story.append(spacer(0.4))

    story.append(Paragraph("Getting Help", H2))
    for item in [
        "If something is not working as expected, contact the ARTickle Academy administrator.",
        "To update your pay rates, profile details, or timetable — reach out to admin.",
        "To add or change school periods, billing settings, or enrollment — contact admin.",
        "For invoice queries, contact your ARTickle account manager.",
    ]:
        story.append(bullet_item(item))

    story.append(spacer(1))
    story.append(HRFlowable(width="100%", thickness=1, color=SLATE_500))
    story.append(spacer(0.2))
    story.append(Paragraph(
        "ARTickle Academy Management Platform  ·  Version 1.0  ·  April 2026  ·  Confidential",
        ParagraphStyle("Footer", parent=BODY, alignment=TA_CENTER, textColor=SLATE_500, fontSize=8)
    ))

    doc.build(story)
    print(f"✓ Manual written to: {OUTPUT}")


if __name__ == "__main__":
    build_manual()
