"""
ARTickle Academy — School Admin Visual Manual (Improved Layout)
Professional infographic with proper spacing and ARTickle branding
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Image
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
import os

# ── App Brand Colors ──────────────────────────────────────────────────────
DARK_BG   = colors.HexColor("#0f172a")    # Dark blue from app
PRIMARY   = colors.HexColor("#6366f1")    # Indigo
ACCENT    = colors.HexColor("#f59e0b")    # Amber
GREEN     = colors.HexColor("#10b981")
BLUE      = colors.HexColor("#3b82f6")
RED       = colors.HexColor("#ef4444")
WHITE     = colors.white
SLATE_500 = colors.HexColor("#64748b")
LIGHT_BG  = colors.HexColor("#f8fafc")

OUTPUT = os.path.join(os.path.dirname(__file__), "School_Admin_Visual_Manual.pdf")

styles = getSampleStyleSheet()

# ── Custom Styles ────────────────────────────────────────────────────────
COVER_TITLE = ParagraphStyle("CoverTitle", parent=styles["Title"],
    fontSize=48, textColor=WHITE, fontName="Helvetica-Bold",
    alignment=TA_CENTER, spaceAfter=0, leading=52)

COVER_SUB = ParagraphStyle("CoverSub", parent=styles["Normal"],
    fontSize=18, textColor=PRIMARY, alignment=TA_CENTER,
    spaceAfter=0, leading=22, fontName="Helvetica-Bold")

TAB_TITLE = ParagraphStyle("TabTitle", parent=styles["Heading1"],
    fontSize=22, textColor=WHITE, fontName="Helvetica-Bold",
    spaceAfter=8, spaceBefore=12, backColor=PRIMARY, leftIndent=12,
    rightIndent=12, topPadding=10, bottomPadding=10)

SECTION_TITLE = ParagraphStyle("SectionTitle", parent=styles["Heading2"],
    fontSize=14, textColor=PRIMARY, fontName="Helvetica-Bold",
    spaceAfter=6, spaceBefore=10)

SUB_TITLE = ParagraphStyle("SubTitle", parent=styles["Heading3"],
    fontSize=11, textColor=ACCENT, fontName="Helvetica-Bold",
    spaceAfter=4, spaceBefore=6)

BODY = ParagraphStyle("Body", parent=styles["Normal"],
    fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=16, spaceAfter=5, alignment=TA_JUSTIFY)

BODY_TIGHT = ParagraphStyle("BodyTight", parent=BODY,
    fontSize=9, leading=14, spaceAfter=3)

LABEL_TEXT = ParagraphStyle("Label", parent=BODY_TIGHT,
    fontSize=8.5, textColor=SLATE_500, fontName="Helvetica",
    spaceAfter=2)

def spacer(h=0.25):
    return Spacer(1, h * cm)

class ARTickleTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width,
                     self.height, id="normal")
        cover = PageTemplate(id="cover", frames=[frame], onPage=self._draw_cover)
        content = PageTemplate(id="content", frames=[frame], onPage=self._draw_content)
        self.addPageTemplates([cover, content])

    def _draw_cover(self, c, doc):
        w, h = A4
        # Dark blue background (app color)
        c.setFillColor(DARK_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # Accent bar at bottom
        c.setFillColor(PRIMARY)
        c.rect(0, 0, w, 1.2*cm, fill=1, stroke=0)

    def _draw_content(self, c, doc):
        w, h = A4
        # Light background
        c.setFillColor(LIGHT_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # Left accent bar
        c.setFillColor(PRIMARY)
        c.rect(0, 0, 0.4*cm, h, fill=1, stroke=0)
        # Footer
        c.setFillColor(SLATE_500)
        c.setFont("Helvetica", 8)
        c.drawString(2*cm, 0.8*cm, "ARTickle Academy • School Administrator Guide")
        c.drawRightString(w - 2*cm, 0.8*cm, f"Page {doc.page}")

def build_manual():
    doc = ARTickleTemplate(OUTPUT, pagesize=A4,
                          leftMargin=2*cm, rightMargin=2*cm,
                          topMargin=2*cm, bottomMargin=1.8*cm)
    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(spacer(3))

    # Try to add logo
    try:
        logo = Image("/Users/karim/Desktop/ the app/ARTickle-academy-app/logo2.png",
                    width=2*cm, height=2*cm)
        story.append(KeepTogether([
            Paragraph("", BODY),  # Spacer
        ]))
    except:
        pass

    story.append(spacer(1.5))
    story.append(Paragraph("ARTickle", COVER_TITLE))
    story.append(spacer(0.2))
    story.append(Paragraph("ACADEMY", COVER_SUB))
    story.append(spacer(2))
    story.append(HRFlowable(width="40%", thickness=2, color=ACCENT, hAlign="CENTER"))
    story.append(spacer(1.5))
    story.append(Paragraph("School Administrator<br/>Visual Guide",
                          ParagraphStyle("CoverSub2", parent=COVER_SUB,
                                       fontSize=16, spaceAfter=0)))
    story.append(spacer(0.8))
    story.append(Paragraph("Complete walkthrough of every feature and tab",
                          ParagraphStyle("CoverDesc", parent=BODY,
                                       textColor=LIGHT_BG, fontSize=10,
                                       alignment=TA_CENTER)))

    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # CONTENTS PAGE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📋 Contents", SECTION_TITLE))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(spacer(0.5))

    contents = [
        ("Tab 1", "Dashboard", "Overview & recent activity"),
        ("Tab 2", "School Lessons", "Lesson history & filtering"),
        ("Tab 3", "Students", "Enrolled student roster"),
        ("Tab 4", "School Periods", "Terms & semesters"),
        ("Tab 5", "Invoices", "Billing & payments"),
        ("Tab 6", "Reports", "Data export"),
        ("Extras", "Tips & Quick Reference", "Keyboard shortcuts"),
    ]

    content_data = []
    for num, title, desc in contents:
        content_data.append([
            Paragraph(f"<b>{num}</b>", LABEL_TEXT),
            Paragraph(f"<b>{title}</b>", BODY_TIGHT),
            Paragraph(desc, LABEL_TEXT),
        ])

    ct = Table(content_data, colWidths=[2*cm, 4*cm, 8*cm])
    ct.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-1), 0.3, colors.HexColor("#e2e8f0")),
    ]))
    story.append(ct)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # TAB 1: DASHBOARD
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📊  TAB 1: DASHBOARD", TAB_TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph(
        "Your school snapshot at a glance. Shows real-time stats, recent lessons, and quick actions.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("What You See:", SECTION_TITLE))
    story.append(spacer(0.2))

    dash_items = [
        ("<b>4 Summary Cards</b> — Students enrolled, Total lessons, This month's lessons, This month's hours",),
        ("<b>Recent Classes Table</b> — Last 20 lessons with date, teacher, student(s), type, duration, status",),
        ("<b>Lesson Detail Popup</b> — Click any lesson row to see full info: evaluations, notes, status",),
        ("<b>Comment Editor</b> — Add 2 types of comments: one for parents (School Teacher Comment), one internal only",),
    ]
    for item in dash_items:
        story.append(Paragraph(f"• {item[0]}", BODY_TIGHT))

    story.append(spacer(0.4))
    story.append(Paragraph("What You Can Do:", SECTION_TITLE))
    story.append(spacer(0.2))

    actions = [
        "Click any lesson to open its full detail",
        "Click <b>+ Add School Comment</b> to add feedback for parents",
        "Add internal notes in the <b>Internal Comment</b> field (never shared)",
        "Click <b>Download PDF</b> to generate a lesson report for the parent",
    ]
    for action in actions:
        story.append(Paragraph(f"• {action}", BODY_TIGHT))

    story.append(spacer(0.5))

    # ══════════════════════════════════════════════════════════════════════════
    # TAB 2: SCHOOL LESSONS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📚  TAB 2: SCHOOL LESSONS", TAB_TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph(
        "Complete lesson history with powerful filtering and bulk export. Find any lesson in seconds.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("Filter System (3 rows):", SECTION_TITLE))
    story.append(spacer(0.2))

    filters = [
        ("<b>Row 1:</b> Search box + Month dropdown + Status dropdown + School Period dropdown",),
        ("<b>Row 2:</b> Date From / Date To pickers for fine-grained date ranges",),
        ("<b>Row 3:</b> Grade filter + Email search to find lessons by student details",),
    ]
    for filt in filters:
        story.append(Paragraph(f"• {filt[0]}", BODY_TIGHT))

    story.append(spacer(0.4))
    story.append(Paragraph("Per-Lesson Actions:", SECTION_TITLE))
    story.append(spacer(0.2))

    lesson_actions = [
        "<b>Click row</b> → Opens read-only lesson detail",
        "<b>Edit button</b> → Edit School Teacher Comment + Internal Comment",
        "<b>PDF button</b> → Download single-lesson PDF for parent",
        "<b>Checkbox</b> → Select lessons for bulk export",
    ]
    for la in lesson_actions:
        story.append(Paragraph(f"• {la}", BODY_TIGHT))

    story.append(spacer(0.5))

    # ══════════════════════════════════════════════════════════════════════════
    # TAB 3: STUDENTS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("👥  TAB 3: STUDENTS", TAB_TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph(
        "Read-only roster of all students enrolled at your school. Click any student to drill down.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("Student List Columns:", SECTION_TITLE))
    story.append(spacer(0.2))

    student_cols = [
        "<b>Name</b> — Clickable to open full profile",
        "<b>Instrument</b> — What they study",
        "<b>Teacher</b> — Assigned teacher name",
        "<b>Lesson Count</b> — Total lessons recorded",
        "<b>Enrollment</b> — Active school periods",
        "<b>Grade</b> — Year/grade level",
    ]
    for col in student_cols:
        story.append(Paragraph(f"• {col}", BODY_TIGHT))

    story.append(spacer(0.4))
    story.append(Paragraph("Student Detail Page Shows:", SECTION_TITLE))
    story.append(spacer(0.2))

    details = [
        "Full lesson history for that student at your school",
        "Attendance % (present vs absent vs cancelled)",
        "Evaluation timeline with rating changes",
        "Enrollment period information",
    ]
    for det in details:
        story.append(Paragraph(f"• {det}", BODY_TIGHT))

    story.append(spacer(0.5))

    # ══════════════════════════════════════════════════════════════════════════
    # TAB 4: SCHOOL PERIODS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📅  TAB 4: SCHOOL PERIODS", TAB_TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph(
        "School Periods define your terms/semesters. Used for organizing and filtering lessons by academic period.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("Per-Period Info:", SECTION_TITLE))
    story.append(spacer(0.2))

    period_info = [
        "<b>Name</b> — e.g. 'Spring 2026' or 'Term 1'",
        "<b>Start Date</b> — When the period begins",
        "<b>End Date</b> — When the period ends",
        "<b>Active/Inactive</b> — Current status of the period",
    ]
    for pi in period_info:
        story.append(Paragraph(f"• {pi}", BODY_TIGHT))

    story.append(spacer(0.3))
    story.append(Paragraph("ℹ️ <i>School Periods are created by the academy admin. "
                          "Contact admin to add or modify terms.</i>", BODY_TIGHT))
    story.append(spacer(0.5))

    # ══════════════════════════════════════════════════════════════════════════
    # TAB 5: INVOICES
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("💳  TAB 5: INVOICES", TAB_TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph(
        "All invoices issued to your school. Track billing, payment status, and outstanding balance.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("Summary Cards:", SECTION_TITLE))
    story.append(spacer(0.2))

    inv_cards = [
        "<b>Total Invoices</b> — Count of all invoices",
        "<b>Outstanding</b> — Amount still owed (amber if > 0)",
        "<b>Paid</b> — Count of fully paid invoices",
        "<b>Overdue</b> — Count of past-due invoices",
    ]
    for ic in inv_cards:
        story.append(Paragraph(f"• {ic}", BODY_TIGHT))

    story.append(spacer(0.4))
    story.append(Paragraph("Invoice Statuses:", SECTION_TITLE))
    story.append(spacer(0.2))

    inv_status = [
        "<b>Draft</b> — Prepared but not sent",
        "<b>Issued</b> — Sent to you, payment expected",
        "<b>Partially Paid</b> — Some payment received",
        "<b>Paid</b> — Fully settled ✓",
        "<b>Overdue</b> — Past due with balance owed",
    ]
    for ist in inv_status:
        story.append(Paragraph(f"• {ist}", BODY_TIGHT))

    story.append(spacer(0.3))
    story.append(Paragraph("ℹ️ <i>Expand any invoice row (▼) to see payment history and dates.</i>", BODY_TIGHT))
    story.append(spacer(0.5))

    # ══════════════════════════════════════════════════════════════════════════
    # TAB 6: REPORTS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📊  TAB 6: REPORTS", TAB_TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph(
        "Bulk data export tool. Download lesson records as Excel for your own records, reporting, or parent communication.",
        BODY
    ))
    story.append(spacer(0.4))

    story.append(Paragraph("How to Export:", SECTION_TITLE))
    story.append(spacer(0.2))

    export_steps = [
        "Set a date range using From/To pickers",
        "Optionally filter by teacher or status",
        "Click <b>Export Excel</b> button",
        "File downloads to your computer",
    ]
    for i, step in enumerate(export_steps, 1):
        story.append(Paragraph(f"{i}. {step}", BODY_TIGHT))

    story.append(spacer(0.4))
    story.append(Paragraph("What's Included:", SECTION_TITLE))
    story.append(spacer(0.2))

    export_cols = [
        "Date & time", "Teacher", "Student(s)", "Instrument", "Type", "Duration",
        "Delivery Mode", "Status", "Evaluation notes"
    ]
    for col in export_cols:
        story.append(Paragraph(f"• {col}", BODY_TIGHT))

    story.append(spacer(0.5))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # QUICK REFERENCE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("⚡ QUICK REFERENCE", SECTION_TITLE))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(spacer(0.4))

    story.append(Paragraph("Common Tasks in 3 Steps:", SECTION_TITLE))
    story.append(spacer(0.2))

    tasks_data = [
        ["Task", "Steps"],
        ["Find a specific lesson",
         "School Lessons → Use Date/Name filters → Click row"],
        ["Add note for parents",
         "Dashboard → Click lesson → + Add School Comment → Save"],
        ["Export all Sept lessons",
         "Reports → Set dates Sept 1-30 → Export Excel"],
        ["Check payment status",
         "Invoices → See Outstanding card → Expand invoice rows"],
        ["View student history",
         "Students → Click name → See all lessons & attendance"],
        ["Generate lesson PDF",
         "School Lessons → Click PDF button on any row"],
    ]

    ttable = Table(tasks_data, colWidths=[4.5*cm, 10*cm])
    ttable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(ttable)

    doc.build(story)
    print(f"✓ Improved infographic written to: {OUTPUT}")
    print(f"✓ Proper spacing, ARTickle branding, and better layout")

if __name__ == "__main__":
    build_manual()
