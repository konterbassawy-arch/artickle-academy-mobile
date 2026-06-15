"""
ARTickle Academy — School Admin Visual Infographic Manual
Creates a visually rich, annotated guide for school administrators
"""

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
from reportlab.graphics.shapes import Drawing, Circle, Rect as GraphRect, String, Line
from reportlab.graphics import renderPDF
import os

PRIMARY   = colors.HexColor("#6366f1")   # indigo
ACCENT    = colors.HexColor("#f59e0b")   # amber
GREEN     = colors.HexColor("#10b981")
BLUE      = colors.HexColor("#3b82f6")
RED       = colors.HexColor("#ef4444")
SLATE_500 = colors.HexColor("#64748b")
SLATE_700 = colors.HexColor("#334155")
LIGHT_BG  = colors.HexColor("#f8fafc")
WHITE     = colors.white

OUTPUT = os.path.join(os.path.dirname(__file__), "School_Admin_Infographic_Manual.pdf")

styles = getSampleStyleSheet()

TITLE = ParagraphStyle("Title", parent=styles["Title"], fontSize=28, textColor=WHITE,
                       alignment=TA_CENTER, spaceAfter=6, fontName="Helvetica-Bold")
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=18, textColor=PRIMARY,
                    fontName="Helvetica-Bold", spaceAfter=6, spaceBefore=4)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, textColor=ACCENT,
                    fontName="Helvetica-Bold", spaceAfter=4, spaceBefore=6)
BODY = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10,
                      textColor=colors.HexColor("#1e293b"), leading=14, spaceAfter=3)
LABEL = ParagraphStyle("Label", parent=BODY, fontSize=9, fontName="Helvetica-Bold",
                       textColor=WHITE)

def make_icon_rect(text, bg_color, x=0, y=0, size=0.8):
    """Create a colored rectangle with text (icon-like)"""
    d = Drawing(size*cm, size*cm)
    d.add(GraphRect(0, 0, size*cm, size*cm, fillColor=bg_color, strokeColor=None))
    d.add(String(size*cm/2, size*cm/2.3, text, fontSize=14, fillColor=WHITE,
                 textAnchor="middle", fontName="Helvetica-Bold"))
    return d

def spacer(h=0.25):
    return Spacer(1, h*cm)

class InfographicTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        template = PageTemplate(id="cover", frames=[frame], onPage=self._draw_cover)
        content = PageTemplate(id="content", frames=[frame], onPage=self._draw_content)
        self.addPageTemplates([template, content])

    def _draw_cover(self, c, doc):
        w, h = A4
        # Gradient-like effect with coloured bars
        c.setFillColor(PRIMARY)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#4f46e5"))
        c.rect(0, h*0.7, w, h*0.3, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.rect(0, 0, w, 0.8*cm, fill=1, stroke=0)

    def _draw_content(self, c, doc):
        w, h = A4
        c.setFillColor(LIGHT_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColor(PRIMARY)
        c.rect(0, 0, 0.4*cm, h, fill=1, stroke=0)
        # Footer
        c.setFillColor(SLATE_500)
        c.setFont("Helvetica", 8)
        c.drawString(2*cm, 0.8*cm, "ARTickle Academy School Admin Guide")
        c.drawRightString(w-2*cm, 0.8*cm, f"Page {doc.page}")

def build_infographic():
    doc = InfographicTemplate(OUTPUT, pagesize=A4,
                              leftMargin=2*cm, rightMargin=2*cm,
                              topMargin=2*cm, bottomMargin=2*cm)
    story = []

    # ── COVER ──────────────────────────────────────────────────────────────
    story.append(spacer(4))
    story.append(Paragraph("ARTickle Academy", TITLE))
    story.append(spacer(0.3))
    story.append(Paragraph("School Administrator Guide", ParagraphStyle(
        "Subtitle", parent=TITLE, fontSize=16, textColor=ACCENT)))
    story.append(spacer(2))
    story.append(HRFlowable(width="50%", thickness=2, color=ACCENT, hAlign="CENTER"))
    story.append(spacer(1))
    story.append(Paragraph("Visual Walkthrough of Every Tab",
                           ParagraphStyle("Sub2", parent=BODY, alignment=TA_CENTER,
                                        fontSize=11, textColor=ACCENT, spaceAfter=0)))
    story.append(spacer(1.5))

    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())

    # ── TAB 1: DASHBOARD ───────────────────────────────────────────────────
    story.append(Paragraph("📊 TAB 1: DASHBOARD", H1))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(spacer(0.3))

    story.append(Paragraph(
        "<b>Your school snapshot at a glance.</b> The first page shows real-time stats, "
        "recent lessons, and quick actions.",
        BODY
    ))

    # Feature grid
    features_data = [
        ["Section", "What it shows", "What you can do"],
        ["📈 Summary Cards (Top)", "4 cards: Students, Total Lessons, This Month's Lessons, This Month's Hours",
         "Click any card to drill down into details"],
        ["📋 Recent Classes Table", "Last 20 lessons with teacher, student(s), type, duration, status",
         "Click any row to view/edit the lesson"],
        ["💬 Lesson Detail Popup", "Full lesson info: date, time, teacher, student(s), notes",
         "Click <b>+ Add School Comment</b> to add feedback visible to parents"],
        ["📄 Comment Editor Modal", "2 text fields: School Teacher Comment + Internal Comment",
         "Save and optionally download a PDF report of the lesson"],
    ]

    ftable = Table(features_data, colWidths=[2.5*cm, 6*cm, 5.5*cm])
    ftable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, SLATE_500),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(ftable)
    story.append(spacer(0.4))

    # Key actions box
    story.append(Paragraph("<b>💡 Pro Tips:</b>", H2))
    for tip in [
        "Hover over a lesson row to see more details before clicking.",
        "The School Teacher Comment appears on the PDF sent to parents.",
        "Internal Comment is never shared — use for internal notes only.",
        "Download lesson PDFs to archive or email to parents directly.",
    ]:
        story.append(Paragraph(f"• {tip}", BODY))
    story.append(spacer(0.4))

    # ── TAB 2: SCHOOL LESSONS ──────────────────────────────────────────────
    story.append(Paragraph("📚 TAB 2: SCHOOL LESSONS", H1))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(spacer(0.3))

    story.append(Paragraph(
        "<b>Complete lesson history with advanced filtering and bulk export.</b> "
        "Find any lesson in seconds using multiple filters.",
        BODY
    ))

    filter_data = [
        ["Filter Row", "Controls", "Purpose"],
        ["Row 1", "Search box + Month + Status + School Period dropdowns",
         "Quick filters for the most common searches"],
        ["Row 2", "Date From / Date To pickers",
         "Fine-grained date range without the month filter"],
        ["Row 3", "Grade + Email filters",
         "Find lessons involving specific students by grade or email"],
        ["Checkboxes", "Check individual lessons or Select All",
         "Bulk-select for export (only selected lessons are exported)"],
    ]

    ftable2 = Table(filter_data, colWidths=[2*cm, 6.5*cm, 6.5*cm])
    ftable2.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, SLATE_500),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(ftable2)
    story.append(spacer(0.3))

    story.append(Paragraph("<b>Actions per lesson row:</b>", H2))
    for action in [
        "<b>Click</b> → Opens read-only lesson detail popup",
        "<b>Edit</b> → Opens comment editor (School Teacher Comment + Internal Comment)",
        "<b>PDF</b> → Downloads a single-lesson PDF (for parents or records)",
        "<b>Checkbox</b> → Select for bulk export",
    ]:
        story.append(Paragraph(f"• {action}", BODY))
    story.append(spacer(0.4))

    # ── TAB 3: STUDENTS ────────────────────────────────────────────────────
    story.append(Paragraph("👥 TAB 3: STUDENTS", H1))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(spacer(0.3))

    story.append(Paragraph(
        "<b>Read-only student roster for your school.</b> View all enrolled students and drill down into individual records.",
        BODY
    ))

    student_data = [
        ["Column", "Shows", "Clickable?"],
        ["Name", "Student full name", "✓ Click to see full profile"],
        ["Instrument", "What instrument they study", "No"],
        ["Teacher", "Assigned teacher name", "No"],
        ["Lesson Count", "Total lessons recorded for this student", "No"],
        ["Enrollment", "Active school enrollment period badges", "No"],
        ["Grade", "Year/grade level (e.g. Grade 5)", "No"],
    ]

    stable = Table(student_data, colWidths=[2*cm, 6*cm, 2*cm])
    stable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), GREEN),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, SLATE_500),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(stable)
    story.append(spacer(0.3))

    story.append(Paragraph("<b>What you can see on student detail:</b>", H2))
    for item in [
        "Full lesson history for that student at your school",
        "Attendance % (how many lessons attended vs total)",
        "Evaluation timeline showing ratings and notes over time",
        "Enrollment period information",
    ]:
        story.append(Paragraph(f"• {item}", BODY))
    story.append(spacer(0.4))

    # ── TAB 4: SCHOOL PERIODS ──────────────────────────────────────────────
    story.append(Paragraph("📅 TAB 4: SCHOOL PERIODS", H1))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(spacer(0.3))

    story.append(Paragraph(
        "<b>Enrollment periods define your school's terms/semesters.</b> "
        "Used for filtering lessons and organizing school calendar.",
        BODY
    ))

    story.append(Paragraph(
        "Each period has: <b>Name</b> (e.g. 'Spring 2026'), <b>Start Date</b>, <b>End Date</b>, <b>Active/Inactive status</b>",
        BODY
    ))
    story.append(spacer(0.2))
    story.append(Paragraph("ℹ️ <i>School Periods are created by the academy admin. "
                          "Contact admin to add or modify terms.</i>", BODY))
    story.append(spacer(0.4))

    # ── TAB 5: INVOICES ────────────────────────────────────────────────────
    story.append(Paragraph("💳 TAB 5: INVOICES", H1))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(spacer(0.3))

    story.append(Paragraph(
        "<b>All invoices issued to your school.</b> Track billing, payment status, and outstanding balance.",
        BODY
    ))

    invoice_data = [
        ["Card", "Displays"],
        ["Total Invoices", "Count of all invoices"],
        ["Outstanding", "Amount still owed (amber if > 0)"],
        ["Paid", "Count of fully paid invoices"],
        ["Overdue", "Count of past-due invoices"],
    ]

    itable = Table(invoice_data, colWidths=[4*cm, 10*cm])
    itable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), BLUE),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, SLATE_500),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(itable)
    story.append(spacer(0.3))

    story.append(Paragraph("<b>Invoice statuses in the table:</b>", H2))
    for status in [
        "<b>Draft</b> → Prepared but not sent",
        "<b>Issued</b> → Sent — payment expected",
        "<b>Partially Paid</b> → Some payment received",
        "<b>Paid</b> → Fully settled ✓",
        "<b>Overdue</b> → Past due with outstanding balance",
    ]:
        story.append(Paragraph(f"• {status}", BODY))
    story.append(spacer(0.2))
    story.append(Paragraph("ℹ️ <i>Expand any invoice row (▼) to see payment history.</i>", BODY))
    story.append(spacer(0.4))

    # ── TAB 6: REPORTS ─────────────────────────────────────────────────────
    story.append(Paragraph("📊 TAB 6: REPORTS", H1))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(spacer(0.3))

    story.append(Paragraph(
        "<b>Bulk data export tool.</b> Download lesson records as Excel for your own records, reporting, or parent sharing.",
        BODY
    ))

    story.append(Paragraph("<b>How to use:</b>", H2))
    for step in [
        "Set a date range using the From/To pickers",
        "Optionally filter by teacher or status",
        "Click <b>Export Excel</b> button",
        "Your browser downloads the Excel file",
    ]:
        story.append(Paragraph(f"• {step}", BODY))
    story.append(spacer(0.3))

    story.append(Paragraph("<b>What's included in the export:</b>", H2))
    for col in ["Student name", "Date & time", "Teacher", "Type", "Duration", "Status", "Evaluation notes"]:
        story.append(Paragraph(f"• {col}", BODY))
    story.append(spacer(0.4))

    # ── CHEAT SHEET ────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("⚡ QUICK REFERENCE CHEAT SHEET", H1))
    story.append(HRFlowable(width="100%", thickness=2, color=PRIMARY))
    story.append(spacer(0.4))

    story.append(Paragraph("<b>Keyboard & UI Tips:</b>", H2))
    for tip in [
        "Use search boxes to quickly find students or lessons by name/ID",
        "Click column headers to sort (on most tables)",
        "Checkboxes let you bulk-select for export",
        "Red badges = urgent status (Cancelled, Overdue)",
        "Green badges = positive status (Paid, Present)",
        "Amber badges = pending (Partial, Absent Excused)",
    ]:
        story.append(Paragraph(f"• {tip}", BODY))

    story.append(spacer(0.4))
    story.append(Paragraph("<b>Common Tasks:</b>", H2))

    tasks_data = [
        ["Task", "Steps"],
        ["Find a specific lesson", "Go to <b>School Lessons</b> → Use Search or Date filters → Click row to view"],
        ["Add a note for parents", "Dashboard or School Lessons → Click lesson → <b>+ Add School Comment</b> → Save"],
        ["Export all September lessons", "<b>Reports</b> → Set date range (Sept 1-30) → Click Export"],
        ["Check school payment status", "<b>Invoices</b> → See <b>Outstanding</b> card → Expand invoices to see details"],
        ["View a student's history", "<b>Students</b> → Click student name → See all lessons & attendance"],
    ]

    ttable = Table(tasks_data, colWidths=[4*cm, 10*cm])
    ttable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, SLATE_500),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(ttable)

    doc.build(story)
    print(f"✓ Visual infographic manual written to: {OUTPUT}")

if __name__ == "__main__":
    build_infographic()
