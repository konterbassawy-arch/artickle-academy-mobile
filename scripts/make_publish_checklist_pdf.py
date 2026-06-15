#!/usr/bin/env python3
"""Generate the App Store / Google Play publishing checklist PDF for ARTickle Academy."""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, ListFlowable, ListItem, PageBreak,
)

OUT = "ARTickle-Academy_App-Store-Publishing-Checklist.pdf"

# ---- Palette (matches the app's slate/blue dark theme) ----
NAVY = colors.HexColor("#0f172a")
SLATE = colors.HexColor("#1e293b")
BLUE = colors.HexColor("#2563eb")
LIGHTBLUE = colors.HexColor("#3b82f6")
GREY = colors.HexColor("#475569")
LIGHTGREY = colors.HexColor("#e2e8f0")
AMBER = colors.HexColor("#b45309")
GREEN = colors.HexColor("#15803d")
TEXT = colors.HexColor("#1f2937")

styles = getSampleStyleSheet()

H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold",
                    fontSize=15, textColor=NAVY, spaceBefore=14, spaceAfter=6, leading=18)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold",
                    fontSize=11.5, textColor=BLUE, spaceBefore=10, spaceAfter=4, leading=14)
BODY = ParagraphStyle("Body", parent=styles["Normal"], fontName="Helvetica",
                      fontSize=10, textColor=TEXT, leading=15, spaceAfter=4, alignment=TA_LEFT)
BULLET = ParagraphStyle("Bullet", parent=BODY, leftIndent=4, spaceAfter=3, leading=14)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8.5, textColor=GREY, leading=12)
TITLE = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold",
                       fontSize=24, textColor=NAVY, spaceAfter=2, leading=27)
SUBTITLE = ParagraphStyle("Subtitle", parent=BODY, fontSize=11, textColor=GREY, spaceAfter=2)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=9, leading=12, spaceAfter=0)
CELLH = ParagraphStyle("CellH", parent=CELL, fontName="Helvetica-Bold", textColor=colors.white)
NOTE = ParagraphStyle("Note", parent=BODY, fontSize=9.5, leading=14, textColor=TEXT)


def flag(text, color):
    return f'<font color="#{color.hexval()[2:]}"><b>{text}</b></font>'


WARN = flag("⚠", AMBER)
OK = flag("✓", GREEN)


def bullets(items, style=BULLET):
    return ListFlowable(
        [ListItem(Paragraph(t, style), value="•", leftIndent=12) for t in items],
        bulletType="bullet", start="•", leftIndent=12, bulletFontSize=8,
        bulletColor=BLUE, spaceBefore=2, spaceAfter=4,
    )


def header_footer(canvas, doc):
    canvas.saveState()
    # top accent bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, stroke=0, fill=1)
    canvas.setFillColor(BLUE)
    canvas.rect(0, A4[1] - 6 * mm, A4[0] * 0.4, 6 * mm, stroke=0, fill=1)
    # footer
    canvas.setFillColor(GREY)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18 * mm, 10 * mm, "ARTickle Academy — Mobile App Store Publishing Checklist")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.drawString(18 * mm, 7 * mm, "Confidential — prepared for internal partner review")
    canvas.restoreState()


def build():
    doc = BaseDocTemplate(
        OUT, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title="ARTickle Academy - App Store Publishing Checklist",
        author="ARTickle Academy",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=header_footer)])

    S = []

    # ---- Title block ----
    S.append(Spacer(1, 4 * mm))
    S.append(Paragraph("App Store Publishing Checklist", TITLE))
    S.append(Paragraph("ARTickle Academy &nbsp;•&nbsp; Google Play + Apple App Store", SUBTITLE))
    S.append(Spacer(1, 3))
    S.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceAfter=8))

    # ---- Context box ----
    ctx = Paragraph(
        f"<b>Current state.</b> ARTickle Academy is a <b>React + Vite web app</b> hosted on "
        f"<b>Firebase Hosting</b> (Firestore + Cloud Functions backend). There is currently "
        f"<b>no native iOS or Android project</b>. The website on its own cannot be submitted to "
        f"either store — it must first be <b>wrapped in a native shell</b>. "
        f"This document is the end-to-end checklist to get there.",
        NOTE,
    )
    box = Table([[ctx]], colWidths=[doc.width])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
        ("BOX", (0, 0), (-1, -1), 0.8, LIGHTBLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    S.append(box)

    # ---- 0. Packaging approach ----
    S.append(Paragraph("0. &nbsp;Pick a packaging approach &nbsp;<font size=9 color='#b45309'>(do this first)</font>", H1))
    data = [
        [Paragraph("Route", CELLH), Paragraph("Android", CELLH), Paragraph("iOS", CELLH), Paragraph("Fit for ARTickle", CELLH)],
        [Paragraph("<b>Capacitor</b> (recommended)", CELL), Paragraph("Yes", CELL), Paragraph("Yes", CELL),
         Paragraph("Best — reuses the existing Vite <font face='Courier'>dist</font> build; one codebase, both stores", CELL)],
        [Paragraph("PWA → TWA (Bubblewrap / PWABuilder)", CELL), Paragraph("Yes", CELL), Paragraph("Weak", CELL),
         Paragraph("Android-mainly; needs a real service worker; iOS support is poor", CELL)],
    ]
    t = Table(data, colWidths=[doc.width * 0.30, doc.width * 0.13, doc.width * 0.12, doc.width * 0.45])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#ecfdf5")),
        ("ROWBACKGROUNDS", (0, 2), (-1, -1), [colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    S.append(t)
    S.append(Paragraph("<b>Recommendation:</b> use <b>Capacitor</b>. It wraps the current build with minimal changes and ships to both stores.", BODY))

    # ---- 1. Code readiness ----
    S.append(Paragraph("1. &nbsp;App-readiness fixes specific to our code", H1))
    S.append(Paragraph("These will cause App Store rejection or broken behaviour inside a native shell. Do them before wrapping.", SMALL))
    S.append(bullets([
        f"{WARN} <b>Stop loading code from CDNs.</b> The app currently pulls React, Tailwind, jsPDF, "
        f"SheetJS and JSZip from CDNs at runtime. Apple guideline 2.5.2 restricts apps that download and "
        f"execute remote code, and it breaks offline launch. <b>Bundle these via npm + Vite instead.</b> "
        f"This is the single biggest blocker.",
        f"{WARN} <b>Add “Sign in with Apple”.</b> The app already offers <b>Google login</b>, and Apple "
        f"<b>requires</b> Sign in with Apple on iPhone whenever any third-party social login is present "
        f"(Apple guideline 4.8). Without it the app is rejected. Only appears on the iPhone version — "
        f"Android and the website are unaffected. Depends on the Apple Developer account being active.",
        f"{WARN} <b>No service worker yet</b> — the app is not a true installable PWA. Required for the "
        f"TWA route; recommended for Capacitor offline reliability.",
        f"{OK} <b>Already in place:</b> web manifest, app icons and theme-color meta tags. Icon and splash "
        f"sizes will need to be expanded for native.",
    ]))

    # ---- 2. Accounts & tooling ----
    S.append(Paragraph("2. &nbsp;Accounts &amp; tooling", H1))
    S.append(bullets([
        "<b>Apple Developer Program</b> — USD $99 / year. Requires a Mac with Xcode for iOS builds.",
        "<b>Google Play Developer account</b> — USD $25 one-time.",
        "Xcode + iOS simulator/device; Android Studio + emulator for local builds and testing.",
    ]))

    # ---- 3. Legal / compliance ----
    S.append(Paragraph("3. &nbsp;Legal &amp; compliance &nbsp;<font size=9 color='#b45309'>(both stores enforce these)</font>", H1))
    S.append(bullets([
        "<b>Privacy policy URL</b> — publicly hosted (can live on Firebase Hosting).",
        f"{WARN} <b>In-app account deletion</b> — because the app has user accounts, Apple (5.1.1 v) and "
        f"Google both require a way for users to delete their account <b>from inside the app</b>, not just by email.",
        "<b>Apple Privacy “Nutrition Label”</b> and <b>Google Play Data Safety form</b> — declare what "
        "Firestore / Cloud Functions collect.",
        "<b>Content / age rating</b> questionnaire on both stores.",
        f"{WARN} <b>Sign in with Apple</b> — <b>mandatory for us</b>, because the app already offers Google "
        "login (see Section 1). Built during the coding phase.",
        "<b>App Tracking Transparency</b> prompt on iOS only if we do cross-app tracking (likely not applicable).",
    ]))

    # ---- 4. Store listing assets ----
    S.append(Paragraph("4. &nbsp;Store listing assets &nbsp;<font size=9 color='#475569'>(per store)</font>", H1))
    S.append(bullets([
        "App name, subtitle, full description, keywords.",
        "<b>Icon</b> — 1024×1024 (Apple), 512×512 (Google Play).",
        "<b>Screenshots</b> for each required device size (iPhone 6.7″ / 6.5″, iPad if supported; Android phone/tablet).",
        "<b>Feature graphic</b> 1024×500 (Google Play).",
        "Support URL, app category, and privacy policy URL.",
    ]))

    # ---- 5. Build, sign, submit ----
    S.append(Paragraph("5. &nbsp;Build, sign &amp; submit", H1))
    S.append(bullets([
        "Set bundle IDs (e.g. <font face='Courier'>com.artickle.academy</font>), version and build number.",
        "<b>iOS:</b> signing certificates + provisioning profiles → Archive in Xcode → upload to "
        "App Store Connect → test via TestFlight first.",
        "<b>Android:</b> generate a signing key → build an <b>AAB</b> (not APK) → upload to Play Console "
        "→ use the internal testing track first.",
        "Submit for review. Typical timelines: Apple ~24–48h; Google hours to a few days.",
    ]))

    # ================= PAGE: COST & PLAN =================
    S.append(PageBreak())

    # ---- 6. Cost ----
    S.append(Paragraph("6. &nbsp;What it costs", H1))
    cost_rows = [
        [Paragraph("Item", CELLH), Paragraph("Cost", CELLH), Paragraph("Frequency", CELLH), Paragraph("Paid by", CELLH)],
        [Paragraph("Claude <b>Max 5×</b> plan (to do the build work)", CELL), Paragraph("$100", CELL), Paragraph("per month", CELL), Paragraph("You", CELL)],
        [Paragraph("Apple Developer Program", CELL), Paragraph("$99", CELL), Paragraph("per year", CELL), Paragraph("You", CELL)],
        [Paragraph("Google Play Developer account", CELL), Paragraph("$25", CELL), Paragraph("one-time", CELL), Paragraph("You", CELL)],
    ]
    ct = Table(cost_rows, colWidths=[doc.width * 0.50, doc.width * 0.15, doc.width * 0.20, doc.width * 0.15])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    S.append(ct)
    S.append(Paragraph(
        "<b>Realistic first-launch outlay ≈ $224</b> &nbsp;($100 Max + $99 Apple + $25 Google). The whole "
        "build should fit inside <b>one month</b> of the Max plan. On a subscription you are <b>not billed "
        "per token</b> — you pay the flat monthly fee and simply have usage limits.", BODY))
    S.append(Paragraph(
        "<b>Which Claude model:</b> use <b>Opus 4.8</b> (the most capable) for the build — since you are not "
        "coding, reliability matters more than saving on usage. The Max 5× plan comfortably covers a project "
        "of this size.", SMALL))

    # ---- 7. Who does what + time ----
    S.append(Paragraph("7. &nbsp;Who does what, and how long", H1))
    work_rows = [
        [Paragraph("Task", CELLH), Paragraph("Who", CELLH), Paragraph("Time", CELLH)],
        [Paragraph("Bundle the CDN code locally (biggest blocker)", CELL), Paragraph("Claude", CELL), Paragraph("~½ day", CELL)],
        [Paragraph("Wrap the app with Capacitor (iOS + Android)", CELL), Paragraph("Claude", CELL), Paragraph("~1 day", CELL)],
        [Paragraph("Add in-app account deletion", CELL), Paragraph("Claude", CELL), Paragraph("~½ day", CELL)],
        [Paragraph("Add Sign in with Apple (iPhone)", CELL), Paragraph("Claude", CELL), Paragraph("~½–1 day", CELL)],
        [Paragraph("Generate icons &amp; splash screens from your logo", CELL), Paragraph("Claude", CELL), Paragraph("~1–2 hrs", CELL)],
        [Paragraph("Register Apple &amp; Google developer accounts", CELL), Paragraph("You", CELL), Paragraph("~1 hr setup*", CELL)],
        [Paragraph("Apple “Services ID” + key (for Sign in with Apple)", CELL), Paragraph("You (guided)", CELL), Paragraph("~30 min", CELL)],
        [Paragraph("Privacy policy text", CELL), Paragraph("You (Claude drafts)", CELL), Paragraph("~1 hr", CELL)],
        [Paragraph("Screenshots &amp; store description", CELL), Paragraph("You + Claude", CELL), Paragraph("a few hrs", CELL)],
        [Paragraph("Final submission (needs your logins + a Mac)", CELL), Paragraph("You (guided)", CELL), Paragraph("~½ day", CELL)],
    ]
    wt = Table(work_rows, colWidths=[doc.width * 0.55, doc.width * 0.25, doc.width * 0.20])
    wt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    S.append(wt)
    S.append(Paragraph("* Apple account approval itself can take 1–2 days — worth starting early.", SMALL))
    S.append(Paragraph(
        "<b>Coding effort:</b> ~3.5–5 working days of Claude’s work. &nbsp; "
        "<b>Calendar time to live in both stores:</b> typically <b>2–4 weeks</b>, mostly waiting on Apple "
        "account approval and store review.", BODY))

    # ---- 8. Updates after launch ----
    S.append(Paragraph("8. &nbsp;Updating the app after launch", H1))
    S.append(bullets([
        f"{OK} <b>Quick fixes &amp; content changes</b> (text, prices, small logic) can be pushed "
        f"<b>instantly — no waiting for approval</b> — if we set up a “live update” mechanism during the "
        f"build. Allowed by both stores for bug fixes and content. This keeps the fast workflow you have today.",
        f"{WARN} <b>New features or bigger changes</b> need a <b>fresh submission + review</b>: Apple usually "
        f"~1 day, Google hours to a day. You don’t rebuild anything — you resubmit and wait for approval.",
        "Bottom line: it is <b>not</b> “wait for approval every single time.” Most day-to-day tweaks stay "
        "instant; only meaningful new features go through review.",
    ]))

    # ---- Critical path ----
    S.append(Spacer(1, 4))
    cp = Paragraph(
        "<b>Critical path:</b> &nbsp;(1) bundle the CDN dependencies locally &nbsp;→&nbsp; "
        "(2) add Capacitor &nbsp;→&nbsp; (3) add in-app account deletion + privacy policy &nbsp;→&nbsp; "
        "(4) generate store assets &nbsp;→&nbsp; (5) submit.",
        NOTE,
    )
    cpbox = Table([[cp]], colWidths=[doc.width])
    cpbox.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    # white text override needs a styled paragraph
    cp_white = Paragraph(
        "<font color='white'><b>Critical path:</b> &nbsp;(1) bundle the CDN dependencies locally &nbsp;&#8594;&nbsp; "
        "(2) add Capacitor &nbsp;&#8594;&nbsp; (3) add account deletion + Sign in with Apple + privacy policy "
        "&nbsp;&#8594;&nbsp; (4) generate store assets &nbsp;&#8594;&nbsp; (5) submit.</font>",
        NOTE,
    )
    cpbox = Table([[cp_white]], colWidths=[doc.width])
    cpbox.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    S.append(cpbox)
    S.append(Spacer(1, 4))
    S.append(Paragraph(
        "Legend: &nbsp;" + WARN + " = blocker / action required &nbsp;&nbsp;&nbsp;" + OK + " = already in place.",
        SMALL,
    ))

    doc.build(S)
    print("WROTE", OUT)


if __name__ == "__main__":
    build()
