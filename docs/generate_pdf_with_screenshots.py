"""
Artickle Academy — School Admin Manual WITH Screenshots
Embeds actual app screenshots in the PDF
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
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
import os

# ── App Brand Colors ──────────────────────────────────────────────────────
DARK_BG   = colors.HexColor("#0f172a")
PRIMARY   = colors.HexColor("#6366f1")
ACCENT    = colors.HexColor("#f59e0b")
GREEN     = colors.HexColor("#10b981")
WHITE     = colors.white
SLATE_500 = colors.HexColor("#64748b")
LIGHT_BG  = colors.HexColor("#f8fafc")

OUTPUT = os.path.join(os.path.dirname(__file__), "Artickle_School_Admin_Complete_Guide.pdf")
LOGO_PATH = "/Users/karim/Desktop/ the app/ARTickle-academy-app/logo2.png"

styles = getSampleStyleSheet()

# ── Styles ────────────────────────────────────────────────────────────────
COVER_TITLE = ParagraphStyle("CoverTitle", parent=styles["Title"],
    fontSize=56, textColor=WHITE, fontName="Helvetica-Bold",
    alignment=TA_CENTER, spaceAfter=0, leading=60)

COVER_SUB = ParagraphStyle("CoverSub", parent=styles["Normal"],
    fontSize=22, textColor=ACCENT, alignment=TA_CENTER,
    spaceAfter=0, leading=26, fontName="Helvetica-Bold")

TAB_TITLE = ParagraphStyle("TabTitle", parent=styles["Heading1"],
    fontSize=20, textColor=WHITE, fontName="Helvetica-Bold",
    spaceAfter=12, spaceBefore=8, backColor=PRIMARY, leftIndent=14,
    rightIndent=12, topPadding=12, bottomPadding=12)

SECTION_TITLE = ParagraphStyle("SectionTitle", parent=styles["Heading2"],
    fontSize=13, textColor=PRIMARY, fontName="Helvetica-Bold",
    spaceAfter=8, spaceBefore=10)

BODY = ParagraphStyle("Body", parent=styles["Normal"],
    fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=15, spaceAfter=6)

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
        c.setFillColor(DARK_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.rect(0, 0, w, 1.5*cm, fill=1, stroke=0)

    def _draw_content(self, c, doc):
        w, h = A4
        c.setFillColor(LIGHT_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColor(PRIMARY)
        c.rect(0, 0, 0.4*cm, h, fill=1, stroke=0)
        c.setFillColor(SLATE_500)
        c.setFont("Helvetica", 8)
        c.drawString(2*cm, 0.8*cm, "Artickle Academy • School Administrator Complete Guide")
        c.drawRightString(w - 2*cm, 0.8*cm, f"Page {doc.page}")

def build_manual():
    doc = ArtickleTemplate(OUTPUT, pagesize=A4,
                          leftMargin=2*cm, rightMargin=2*cm,
                          topMargin=2*cm, bottomMargin=1.8*cm)
    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(spacer(2.5))

    try:
        logo = Image(LOGO_PATH, width=3.5*cm, height=3.5*cm)
        story.append(KeepTogether([logo]))
        story.append(spacer(1))
    except:
        story.append(spacer(2))

    story.append(Paragraph("Artickle", COVER_TITLE))
    story.append(spacer(0.2))
    story.append(Paragraph("ACADEMY", COVER_SUB))
    story.append(spacer(2))
    story.append(HRFlowable(width="50%", thickness=3, color=ACCENT, hAlign="CENTER"))
    story.append(spacer(2))
    story.append(Paragraph("School Administrator<br/>Complete Guide",
                          ParagraphStyle("CoverDesc", parent=styles["Normal"],
                                       fontSize=20, textColor=WHITE,
                                       alignment=TA_CENTER, leading=24)))
    story.append(spacer(1.2))
    story.append(Paragraph("With Live App Screenshots & Step-by-Step Walkthroughs",
                          ParagraphStyle("CoverTag", parent=BODY,
                                       textColor=LIGHT_BG, fontSize=11,
                                       alignment=TA_CENTER, fontName="Helvetica-Oblique")))

    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # TABLE OF CONTENTS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("📋 Navigation Guide", SECTION_TITLE))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(spacer(0.4))

    story.append(Paragraph(
        "Artickle Academy provides 6 main tabs for managing your school's music programme. "
        "This guide walks you through each one with screenshots and detailed explanations.",
        BODY
    ))
    story.append(spacer(0.6))

    nav_data = [
        ["Tab", "Purpose", "Key Features"],
        ["📊 Dashboard", "Real-time overview", "Stats, Recent lessons, Comments"],
        ["📚 Lessons", "Complete history", "Filters, Export, PDFs"],
        ["👥 Students", "Enrollment roster", "Profiles, Attendance, History"],
        ["📅 Periods", "School calendar", "Terms, Semesters"],
        ["💳 Invoices", "Billing tracking", "Payment status, History"],
        ["📤 Reports", "Data export", "Excel downloads"],
    ]

    ntable = Table(nav_data, colWidths=[2.2*cm, 4.8*cm, 7*cm])
    ntable.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_BG, WHITE]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(ntable)
    story.append(spacer(1))

    # ══════════════════════════════════════════════════════════════════════════
    # TAB GUIDES WITH SCREENSHOTS
    # ══════════════════════════════════════════════════════════════════════════

    tabs_guide = [
        {
            "title": "📊 DASHBOARD",
            "subtitle": "Your School Snapshot",
            "description": "Real-time overview of school activity, recent lessons, and quick actions.",
            "screenshot": "/tmp/artickle_dashboard.png",
            "features": [
                ("4 Summary Cards", "Students • Total Lessons • This Month's Lessons • This Month's Hours"),
                ("Recent Classes", "Table of last 20 lessons with date, teacher, students, type, duration, status"),
                ("Lesson Details", "Click any lesson to see full information, evaluations, and notes"),
                ("Comments", "Add School Teacher Comment (visible to parents) or Internal Comment (private)"),
                ("PDF Reports", "Generate lesson PDFs to send directly to parents"),
            ],
            "actions": [
                "Click any lesson row to view details",
                "Click + Add School Comment to provide feedback",
                "Click Download PDF to create parent report",
                "Hover over status badges to see lesson status",
            ]
        },
        {
            "title": "📚 SCHOOL LESSONS",
            "subtitle": "Complete Lesson History with Filters",
            "description": "Searchable database of all lessons with advanced filtering and bulk export.",
            "screenshot": "/tmp/artickle_school.png",
            "features": [
                ("Row 1 Filters", "Search • Month • Status • School Period dropdowns"),
                ("Row 2 Filters", "Date From / Date To pickers for custom date ranges"),
                ("Row 3 Filters", "Grade dropdown • Email search for student-specific filtering"),
                ("Lesson Selection", "Use checkboxes to select lessons for bulk operations"),
                ("Bulk Export", "Select and export to Excel, or export all filtered results"),
            ],
            "actions": [
                "Click lesson row to view read-only details",
                "Click Edit button to add/modify School Teacher Comments",
                "Click PDF button to download single lesson report",
                "Check boxes to select lessons, then click Export Excel",
            ]
        },
        {
            "title": "👥 STUDENTS",
            "subtitle": "Student Enrollment Roster",
            "description": "Read-only view of all enrolled students with filtering and drill-down profiles.",
            "screenshot": "/tmp/artickle_students.png",
            "features": [
                ("Student List", "Name • Instrument • Teacher • Lesson Count • Enrollment • Grade"),
                ("Filters", "Grade dropdown • Name/Instrument/Email search"),
                ("Student Profile", "Click any student name to see full lesson history"),
                ("Attendance", "View attendance percentage and completed vs total lessons"),
                ("Evaluation Data", "See how ratings and notes change over time"),
            ],
            "actions": [
                "Click student name to open their profile",
                "Review lesson history and attendance rate",
                "Track evaluation progress over time",
                "Filter by grade to see cohort information",
            ]
        },
        {
            "title": "📅 SCHOOL PERIODS",
            "subtitle": "Academic Terms & Semesters",
            "description": "Define and manage your school's academic calendar for organization.",
            "screenshot": "/tmp/artickle_school.png",
            "features": [
                ("Period Info", "Name (e.g. Spring 2026) • Start Date • End Date • Status"),
                ("Organizing", "Group lessons and students by academic period"),
                ("Use as Filter", "School Lessons page lets you filter by period"),
                ("Admin Only", "Periods created by academy admin - contact admin to add/modify"),
            ],
            "actions": [
                "View all school periods",
                "Use periods to organize and filter lessons",
                "Reference for academic calendar planning",
            ]
        },
        {
            "title": "💳 INVOICES",
            "subtitle": "Billing & Payment Tracking",
            "description": "Monitor invoices, payment status, and outstanding balances.",
            "screenshot": "/tmp/artickle_invoices.png",
            "features": [
                ("Summary Cards", "Total Invoices • Outstanding • Paid • Overdue counts"),
                ("Invoice Table", "Invoice # • Period • Amount • Paid • Balance • Due Date • Status"),
                ("Payment History", "Expand any invoice (▼) to see payment details and dates"),
                ("Status Tracking", "Draft • Issued • Partially Paid • Paid • Overdue • Cancelled"),
            ],
            "actions": [
                "Check Outstanding card for total balance owed",
                "Expand invoice rows to see payment history",
                "Track payment dates and amounts received",
                "Monitor overdue invoices",
            ]
        },
        {
            "title": "📤 REPORTS",
            "subtitle": "Data Export for Analysis",
            "description": "Export lesson data as Excel for your own analysis and reporting.",
            "screenshot": "/tmp/artickle_reports.png",
            "features": [
                ("Date Range", "From/To date pickers to select export period"),
                ("Filtering", "Optionally filter by teacher or status before exporting"),
                ("Excel Format", "Downloads as .xlsx for use in spreadsheets"),
                ("Data Included", "Date • Teacher • Student(s) • Instrument • Type • Duration • Mode • Status • Notes"),
            ],
            "actions": [
                "Set date range (entire month, specific term, etc.)",
                "Apply optional filters for narrower export",
                "Click Export Excel to download",
                "File opens in Excel/Sheets for analysis",
            ]
        },
    ]

    for tab in tabs_guide:
        story.append(Paragraph(f"{tab['title']}", TAB_TITLE))
        story.append(spacer(0.3))
        story.append(Paragraph(f"<i>{tab['subtitle']}</i>", SECTION_TITLE))
        story.append(spacer(0.2))
        story.append(Paragraph(tab['description'], BODY))
        story.append(spacer(0.4))

        # Add screenshot
        try:
            if os.path.exists(tab['screenshot']):
                img = Image(tab['screenshot'], width=14*cm, height=10.5*cm)
                story.append(img)
                story.append(spacer(0.4))
        except Exception as e:
            story.append(Paragraph(f"[Screenshot: {tab['title']}]", BODY_SMALL))
            story.append(spacer(0.3))

        # Features
        story.append(Paragraph("<b>Features:</b>", SECTION_TITLE))
        for feature, detail in tab['features']:
            story.append(Paragraph(f"<b>• {feature}</b> — {detail}", BODY_SMALL))

        story.append(spacer(0.3))

        # Actions
        story.append(Paragraph("<b>What You Can Do:</b>", SECTION_TITLE))
        for action in tab['actions']:
            story.append(Paragraph(f"• {action}", BODY_SMALL))

        story.append(spacer(0.8))
        story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # QUICK REFERENCE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("⚡ Quick Reference", SECTION_TITLE))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(spacer(0.5))

    story.append(Paragraph("<b>Common Tasks:</b>", SECTION_TITLE))
    story.append(spacer(0.2))

    tasks = [
        ("Find a specific lesson", "School Lessons → Use filters or search → Click lesson row"),
        ("Add note for parents", "Dashboard → Click lesson → + Add School Comment → Save"),
        ("Export all September lessons", "Reports → Set dates Sept 1-30 → Click Export Excel"),
        ("Check school balance owed", "Invoices → See Outstanding card → Expand invoice rows"),
        ("View student history", "Students → Click student name → See all lessons & attendance"),
        ("Generate lesson PDF", "School Lessons → Click PDF button on any lesson row"),
    ]

    for task, steps in tasks:
        story.append(Paragraph(f"<b>• {task}</b>", BODY_SMALL))
        story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{steps}", BODY_SMALL))

    story.append(spacer(0.6))
    story.append(Paragraph("<b>💡 Pro Tips:</b>", SECTION_TITLE))
    story.append(spacer(0.2))

    tips = [
        "Use search boxes to quickly find lessons or students",
        "Sort tables by clicking column headers",
        "Red badges = Urgent (Cancelled, Overdue)",
        "Green badges = Positive (Paid, Present)",
        "Amber badges = Pending (Partial, Absent Excused)",
        "School Teacher Comments appear on parent-facing PDFs",
        "Internal Comments are never shared - use for internal notes",
    ]

    for tip in tips:
        story.append(Paragraph(f"• {tip}", BODY_SMALL))

    doc.build(story)
    print(f"✅ Complete PDF created with screenshots!")
    print(f"📄 File: {OUTPUT}")

if __name__ == "__main__":
    build_manual()
