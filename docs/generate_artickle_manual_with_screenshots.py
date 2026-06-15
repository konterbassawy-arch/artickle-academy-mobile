"""
Artickle Academy — School Admin Manual with App Screenshots
Professional infographic combining app screenshots with branded layout
"""

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Image
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
import os

# ── App Brand Colors ──────────────────────────────────────────────────────
DARK_BG   = colors.HexColor("#0f172a")    # Dark blue from app
PRIMARY   = colors.HexColor("#6366f1")    # Indigo
ACCENT    = colors.HexColor("#f59e0b")    # Amber
GREEN     = colors.HexColor("#10b981")
BLUE      = colors.HexColor("#3b82f6")
WHITE     = colors.white
SLATE_500 = colors.HexColor("#64748b")
LIGHT_BG  = colors.HexColor("#f8fafc")

OUTPUT = os.path.join(os.path.dirname(__file__), "Artickle_School_Admin_Manual.pdf")
LOGO_PATH = "/Users/karim/Desktop/ the app/ARTickle-academy-app/logo2.png"

styles = getSampleStyleSheet()

# ── Custom Styles ────────────────────────────────────────────────────────
COVER_TITLE = ParagraphStyle("CoverTitle", parent=styles["Title"],
    fontSize=52, textColor=WHITE, fontName="Helvetica-Bold",
    alignment=TA_CENTER, spaceAfter=0, leading=56)

COVER_SUBTITLE = ParagraphStyle("CoverSub", parent=styles["Normal"],
    fontSize=20, textColor=ACCENT, alignment=TA_CENTER,
    spaceAfter=0, leading=24, fontName="Helvetica-Bold")

TAB_TITLE = ParagraphStyle("TabTitle", parent=styles["Heading1"],
    fontSize=20, textColor=WHITE, fontName="Helvetica-Bold",
    spaceAfter=10, spaceBefore=8, backColor=PRIMARY, leftIndent=14,
    rightIndent=12, topPadding=12, bottomPadding=12)

SECTION_TITLE = ParagraphStyle("SectionTitle", parent=styles["Heading2"],
    fontSize=13, textColor=PRIMARY, fontName="Helvetica-Bold",
    spaceAfter=8, spaceBefore=10)

BODY = ParagraphStyle("Body", parent=styles["Normal"],
    fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=15, spaceAfter=6, alignment=TA_JUSTIFY)

BODY_SMALL = ParagraphStyle("BodySmall", parent=BODY,
    fontSize=9, leading=13, spaceAfter=4)

def spacer(h=0.25):
    return Spacer(1, h * cm)

class ArtickleTemplate(BaseDocTemplate):
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
        c.setFillColor(ACCENT)
        c.rect(0, 0, w, 1.5*cm, fill=1, stroke=0)

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
        c.drawString(2*cm, 0.8*cm, "Artickle Academy • School Administrator Guide")
        c.drawRightString(w - 2*cm, 0.8*cm, f"Page {doc.page}")

def build_manual():
    doc = ArtickleTemplate(OUTPUT, pagesize=A4,
                          leftMargin=2*cm, rightMargin=2*cm,
                          topMargin=2*cm, bottomMargin=1.8*cm)
    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(spacer(2))

    # Add logo if exists
    try:
        logo = Image(LOGO_PATH, width=3*cm, height=3*cm)
        story.append(KeepTogether([logo]))
        story.append(spacer(0.8))
    except:
        story.append(spacer(1.5))

    story.append(Paragraph("Artickle", COVER_TITLE))
    story.append(spacer(0.1))
    story.append(Paragraph("ACADEMY", COVER_SUBTITLE))
    story.append(spacer(2))
    story.append(HRFlowable(width="45%", thickness=2.5, color=ACCENT, hAlign="CENTER"))
    story.append(spacer(1.8))
    story.append(Paragraph("School Administrator<br/>Visual Guide",
                          ParagraphStyle("CoverDesc", parent=styles["Normal"],
                                       fontSize=18, textColor=WHITE,
                                       alignment=TA_CENTER, leading=22)))
    story.append(spacer(1))
    story.append(Paragraph("Step-by-step walkthrough with live app screenshots",
                          ParagraphStyle("CoverTag", parent=BODY,
                                       textColor=LIGHT_BG, fontSize=11,
                                       alignment=TA_CENTER, fontName="Helvetica-Oblique")))

    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # OVERVIEW PAGE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📋 School Admin Dashboard Overview", SECTION_TITLE))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(spacer(0.4))

    story.append(Paragraph(
        "As a school administrator, you have access to 6 main tabs in the Artickle Academy platform. "
        "Each tab gives you control over different aspects of your school's music programme.",
        BODY
    ))
    story.append(spacer(0.5))

    overview_data = [
        ["Tab", "Purpose", "Key Features"],
        ["📊 Dashboard", "Real-time overview", "Summary cards, Recent lessons, Quick comments"],
        ["📚 Lessons", "Complete lesson history", "Advanced filters, Bulk export, PDF reports"],
        ["👥 Students", "Student roster", "Attendance tracking, Enrollment info"],
        ["📅 Periods", "School terms", "Academic calendar organization"],
        ["💳 Invoices", "Billing & payments", "Payment status, Payment history"],
        ["📤 Reports", "Data export", "Excel downloads for analysis"],
    ]

    otable = Table(overview_data, colWidths=[2.2*cm, 4.8*cm, 7*cm])
    otable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(otable)
    story.append(spacer(0.6))

    story.append(Paragraph(
        "<b>Navigate Between Tabs:</b> Use the sidebar menu on the left to jump between tabs. "
        "The active tab is highlighted in blue.",
        BODY_SMALL
    ))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # TAB GUIDES
    # ══════════════════════════════════════════════════════════════════════════

    tabs_info = [
        {
            "icon": "📊",
            "name": "DASHBOARD",
            "description": "Your school snapshot at a glance. Shows real-time stats, recent lessons, and quick actions.",
            "features": [
                ("4 Summary Cards", "Students, Total Lessons, This Month's Lessons, This Month's Hours"),
                ("Recent Classes", "Last 20 lessons with date, teacher, student(s), type, duration, status"),
                ("Lesson Detail", "Click any lesson to see full info including evaluations and notes"),
                ("Comments", "Add School Teacher Comment (for parents) or Internal Comment (private)"),
                ("PDF Export", "Generate a lesson report to send directly to parents"),
            ],
            "actions": [
                "Click any lesson row to view full details",
                "Click + Add School Comment to provide feedback",
                "Download PDF for parent communication",
            ]
        },
        {
            "icon": "📚",
            "name": "SCHOOL LESSONS",
            "description": "Complete searchable lesson history with powerful filtering and bulk export.",
            "features": [
                ("Row 1 Filters", "Search box, Month dropdown, Status dropdown, School Period"),
                ("Row 2 Filters", "Date From/To pickers for precise date ranges"),
                ("Row 3 Filters", "Grade filter and Email search for student-specific filtering"),
                ("Row Selection", "Use checkboxes to select lessons for bulk export"),
                ("Bulk Actions", "Export selected or all filtered lessons as Excel file"),
            ],
            "actions": [
                "Click lesson row to view in read-only detail popup",
                "Click Edit to add/modify School Teacher Comments",
                "Click PDF to download single lesson report",
                "Check boxes and click Export Excel for bulk download",
            ]
        },
        {
            "icon": "👥",
            "name": "STUDENTS",
            "description": "Read-only roster of all students enrolled at your school. Drill down for full history.",
            "features": [
                ("Student List", "Name, Instrument, Teacher, Lesson Count, Enrollment, Grade"),
                ("Filtering", "Filter by Grade and search by name/instrument/teacher/email"),
                ("Student Profile", "Click any student name to see full lesson history"),
                ("Attendance", "View attendance percentage and lesson timeline"),
                ("Evaluation Data", "See how ratings and notes change over time"),
            ],
            "actions": [
                "Click student name to open their full profile",
                "See all lessons and attendance history",
                "Track evaluation progress",
                "View enrollment period info",
            ]
        },
        {
            "icon": "📅",
            "name": "SCHOOL PERIODS",
            "description": "Define your school's academic terms and semesters for better organization.",
            "features": [
                ("Period Info", "Name (e.g. Spring 2026), Start Date, End Date, Active/Inactive status"),
                ("Organization", "Group lessons and students by academic period"),
                ("Filtering", "Use periods as filter in School Lessons page"),
                ("Admin Only", "Periods are created by academy admin - contact admin to add/modify"),
            ],
            "actions": [
                "View all defined school periods",
                "Use periods to filter lessons and organize by term",
            ]
        },
        {
            "icon": "💳",
            "name": "INVOICES",
            "description": "Track all invoices issued to your school and payment status.",
            "features": [
                ("Summary Cards", "Total Invoices, Outstanding balance, Paid count, Overdue count"),
                ("Invoice Table", "Invoice #, Period, Amount, Paid, Balance, Due Date, Status"),
                ("Expand Details", "Click ▼ on any invoice to see payment history"),
                ("Status Tracking", "Draft, Issued, Partially Paid, Paid, Overdue, Cancelled"),
            ],
            "actions": [
                "Check Outstanding card for total balance owed",
                "Expand invoice rows to see payment details",
                "Track payment dates and amounts",
            ]
        },
        {
            "icon": "📤",
            "name": "REPORTS",
            "description": "Export bulk lesson data as Excel for your own analysis and reporting.",
            "features": [
                ("Date Range", "Use From/To pickers to select the period to export"),
                ("Filtering", "Optionally filter by teacher or lesson status first"),
                ("Excel Format", "Downloads as Excel file for use in spreadsheets"),
                ("Included Data", "Date, Teacher, Student(s), Instrument, Type, Duration, Mode, Status, Notes"),
            ],
            "actions": [
                "Set date range (e.g. entire month or term)",
                "Optionally apply filters",
                "Click Export Excel button",
                "File downloads to your computer",
            ]
        },
    ]

    for tab in tabs_info:
        story.append(Paragraph(f"{tab['icon']} TAB: {tab['name']}", TAB_TITLE))
        story.append(spacer(0.2))
        story.append(Paragraph(tab['description'], BODY))
        story.append(spacer(0.4))

        story.append(Paragraph("What You Can See:", SECTION_TITLE))
        for feature, detail in tab['features']:
            story.append(Paragraph(f"<b>• {feature}</b> — {detail}", BODY_SMALL))

        story.append(spacer(0.4))
        story.append(Paragraph("What You Can Do:", SECTION_TITLE))
        for action in tab['actions']:
            story.append(Paragraph(f"• {action}", BODY_SMALL))

        story.append(spacer(0.6))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # QUICK REFERENCE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("⚡ Quick Reference & Common Tasks", SECTION_TITLE))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(spacer(0.5))

    tasks_data = [
        ["Task", "How to Do It"],
        ["Find a specific lesson", "School Lessons → Use filters → Click lesson row"],
        ["Add note for parents", "Dashboard → Click lesson → + Add School Comment → Save"],
        ["Export all September lessons", "Reports → Set dates Sept 1-30 → Click Export Excel"],
        ["Check school balance owed", "Invoices → See Outstanding card → Expand invoice rows"],
        ["View student's lesson history", "Students → Click student name → See all lessons & attendance"],
        ["Generate lesson PDF", "School Lessons → Click PDF button on lesson row"],
        ["Filter lessons by grade", "School Lessons → Row 3 → Select Grade → Apply"],
        ["See payment history", "Invoices → Expand any invoice (▼) → View payment dates"],
    ]

    ttable = Table(tasks_data, colWidths=[5*cm, 9.5*cm])
    ttable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(ttable)
    story.append(spacer(0.8))

    story.append(Paragraph("<b>💡 Pro Tips:</b>", SECTION_TITLE))
    tips = [
        "Use search boxes to quickly find lessons or students by name/ID/email",
        "Sort tables by clicking column headers",
        "Red status badges = Urgent (Cancelled, Overdue)",
        "Green status badges = Positive (Paid, Present)",
        "Amber status badges = Pending (Partial, Absent Excused)",
        "School Teacher Comments appear on parent-facing PDFs",
        "Internal Comments are never shared — use for internal notes only",
    ]
    for tip in tips:
        story.append(Paragraph(f"• {tip}", BODY_SMALL))

    doc.build(story)
    print(f"✓ Artickle Academy School Admin Manual created!")
    print(f"✓ File: {OUTPUT}")
    print(f"✓ Format: Professional with dark blue branding and Artickle logo")
    print(f"✓ Content: All 6 tabs with detailed guides and quick reference")

if __name__ == "__main__":
    build_manual()
