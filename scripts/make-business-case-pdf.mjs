// One-off: builds docs/rhg-intranet-business-case.pdf (Step 21).
// Run with: node scripts/make-business-case-pdf.mjs
import PDFDocument from 'pdfkit'
import { createWriteStream } from 'node:fs'

const OUT = 'docs/rhg-intranet-business-case.pdf'
const LOGO = 'public/rhg-logo.png'
const BLUE = '#006B96'
const NAVY = '#14213D'
const ORANGE = '#FCA311'
const GREY = '#555555'
const LIGHT = '#E5E5E5'
const L = 50
const W = 495

const doc = new PDFDocument({ size: 'A4', margin: L, info: { Title: 'RHG Intranet - Business Case' } })
doc.pipe(createWriteStream(OUT))

function header(title, sub) {
  doc.rect(0, 0, 595, 80).fill(BLUE)
  doc.image(LOGO, L, 18, { height: 44 })
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text(title, 200, 24, { width: 345, align: 'right' })
  if (sub) doc.font('Helvetica').fontSize(10).text(sub, 200, 50, { width: 345, align: 'right' })
  doc.fillColor(NAVY)
  doc.y = 105
}

function heading(text) {
  doc.moveDown(0.6)
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(text, L, doc.y, { width: W })
  doc.rect(L, doc.y + 2, 40, 3).fill(ORANGE)
  doc.y += 12
  doc.fillColor('#000')
}

function para(text, opts = {}) {
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 10.5).fillColor(opts.color ?? '#000')
    .text(text, L, doc.y, { width: W })
  doc.moveDown(0.4)
}

function bullets(items) {
  doc.font('Helvetica').fontSize(10.5).fillColor('#000')
  for (const t of items) doc.text('•  ' + t, L + 8, doc.y, { width: W - 8 }), doc.moveDown(0.25)
}

function table(cols, rows, opts = {}) {
  const widths = cols.map(c => c.w)
  const draw = (cells, o) => {
    const y = doc.y
    const hs = cells.map((t, i) => doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
      .heightOfString(String(t), { width: widths[i] - 10 }))
    const h = Math.max(...hs) + 10
    if (o.fill) doc.rect(L, y, W, h).fill(o.fill)
    let x = L
    cells.forEach((t, i) => {
      doc.fillColor(o.color ?? '#000').font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
        .text(String(t), x + 5, y + 5, { width: widths[i] - 10, align: cols[i].align ?? 'left' })
      x += widths[i]
    })
    doc.rect(L, y + h - 0.5, W, 0.5).fill(LIGHT)
    doc.y = y + h
  }
  draw(cols.map(c => c.h), { bold: true, fill: NAVY, color: '#fff' })
  rows.forEach((r, i) => draw(r, { fill: opts.boldLast && i === rows.length - 1 ? '#FFF3D6' : undefined, bold: opts.boldLast && i === rows.length - 1 }))
  doc.fillColor('#000')
  doc.y += 6
}

// ---------- Page 1: the headline ----------
header('RHG Intranet', 'Business case: one place for the tools we use every day')

heading('The short version')
para('The intranet brings the tools RHG uses into one place that everyone can open: expense claims, leave, '
  + 'inspection reports, projects, product information and cost modelling, plus posts, events and company '
  + 'figures on the dashboard. It replaces paid apps that only a few people can use, and it costs far less to run.')

// headline boxes
const by = doc.y + 4
const boxes = [
  ['About AUD 7,500', 'a year spent today on AuditComply and Asana'],
  ['About AUD 550', 'a year to run the intranet'],
  ['About AUD 20,900', 'saved over 3 years, with more people able to use it']
]
boxes.forEach(([big, small], i) => {
  const x = L + i * 168
  doc.roundedRect(x, by, 159, 78, 6).fill(i === 2 ? '#FFF3D6' : '#F2F6F9')
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(big, x + 8, by + 14, { width: 143, align: 'center' })
  doc.fillColor(GREY).font('Helvetica').fontSize(9.5).text(small, x + 8, by + 42, { width: 143, align: 'center' })
})
doc.y = by + 96

heading('What we pay today compared with the intranet')
table(
  [{ h: 'Tool today', w: 150 }, { h: 'Cost per year', w: 105 }, { h: 'In the intranet', w: 240 }],
  [
    ['AuditComply', 'AUD 5,000', 'Inspection Reporting: only 5 people can use AuditComply and we use about 20% of it'],
    ['Asana', 'AUD 2,500', 'Projects: limited seats, and some tasks are handled outside it'],
    ['Plytix (stopped)', 'about AUD 6,000*', 'Product Information: we have had no single source of product data since it stopped'],
    ['Excel VBA expense sheets', 'staff time; market apps start at RM 3 per user per month (about AUD 190 a year for 15 people)', 'Expense Claims: one change in one place instead of editing every sheet'],
    ['Jibble (leave)', 'free (via Eurogain)', 'Leave Applications: same job, in the same place as everything else'],
    ['Employment Hero**', 'about AUD 24 per user per month', 'Posts and leave for the AU team can move here; policies and performance management are in "More to come"']
  ]
)
para('* Plytix was about AUD 500 a month. This figure comes from the Plytix website (Pro plan) and still needs to be confirmed with finance. The saving above does not count Plytix, because we have already stopped paying for it.', { size: 8.5, color: GREY })
para('** Estimate from the Employment Hero website (Core plan), to be confirmed with finance. Not counted in the saving, because only part of what it does would be replaced.', { size: 8.5, color: GREY })

// ---------- Page 2: running cost ----------
doc.addPage()
header('What the intranet costs to run', 'Three-year cost, based on our expected use')

heading('Running cost over 3 years (AUD)')
table(
  [{ h: 'Item', w: 195 }, { h: 'Year 1', w: 70, align: 'right' }, { h: 'Year 2', w: 70, align: 'right' }, { h: 'Year 3', w: 70, align: 'right' }, { h: '3 years', w: 90, align: 'right' }],
  [
    ['Hosting (Railway)', '90', '90', '90', '270'],
    ['Database and sign-in (Supabase Pro, includes backups)', '450', '450', '450', '1,350'],
    ['File storage (Cloudflare R2), free up to 10 GB', '0', '1', '2', '3'],
    ['Custom domain (intranet.rapidhardwaregroup.com.au)*', '0', '0', '0', '0'],
    ['Total', 'about 540', 'about 540', 'about 540', 'about 1,630']
  ],
  { boldLast: true }
)
para('* A subdomain of the existing company domain, so it only needs a DNS entry and no extra fee (to be confirmed with whoever manages the domain). Buying a separate new domain would be roughly AUD 20 to 30 a year.', { size: 9, color: GREY })
para('Compared with AUD 7,500 a year on AuditComply and Asana, that is about AUD 22,500 over 3 years against about AUD 1,630: a saving of about AUD 20,900. Prices are from each provider website and assumed unchanged. '
  + 'Not included yet, to be confirmed: a company email service for sign-up and notification emails, and Microsoft sign-in.', { size: 9, color: GREY })

heading('How much we expect to store')
table(
  [{ h: 'What', w: 300 }, { h: 'Per month', w: 95, align: 'right' }, { h: 'First year', w: 100, align: 'right' }],
  [
    ['Posts (3 a month, one 2 MB photo each)', '6 MB', '72 MB'],
    ['Expense claims (15 people, 6 claims each, 200 KB each)', '18 MB', '216 MB'],
    ['Leave (15 applications a month, one 1 MB attachment)', '1 MB', '12 MB'],
    ['Projects (10 a month, 20 MB each)', '200 MB', '2.4 GB'],
    ['Inspections (10 a month, 30 MB each)', '300 MB', '3.6 GB'],
    ['Product information (200 products, 3 photos of 5 MB each)', 'one-off', '3 GB'],
    ['Total', '', 'about 9.3 GB']
  ],
  { boldLast: true }
)
para('Storage grows to about 16 GB in year 2 and 22 GB in year 3. Beyond the free 10 GB, the extra cost is a few cents a month, so growth does not change the picture.')

heading('Why it is worth more than the saving')
bullets([
  'One source of truth: everyone looks in the same place instead of asking around or going through layers of people.',
  'More people can see what they need: inspection reports are no longer limited to 5 AuditComply users, and company figures reach everyone, not only when they are shared each quarter.',
  'Built for RHG: the project summary, expense rules and inspection forms follow how we work, instead of paying for features we never use.',
  'Changes are quick: a change is made once, not on every employee\'s Excel sheet.'
])

// ---------- Page 3: what it does + more to come ----------
doc.addPage()
header('What the intranet already does', 'Built and working today')

heading('Tools')
table(
  [{ h: 'Tool', w: 130 }, { h: 'What it does for the team', w: 365 }],
  [
    ['Expense Claims', 'Submit claims with receipts, managers approve, payroll report ready for finance.'],
    ['Leave Applications', 'Apply, approve, live balances, team calendar, public holidays.'],
    ['Inspection Reporting', 'Phone-friendly QC checklists with photos, review and sign-off, PDF report for anyone.'],
    ['Projects', 'Task lists per project type, automatic due dates when a task unlocks, project overview for the whole company.'],
    ['Product Information', 'One catalogue of every product: suppliers, packaging, photos, documents, completeness score.'],
    ['Cost Modelling', 'Landed cost and margins for any product, anyone can use it.']
  ]
)

heading('Dashboard')
bullets([
  'Posts and announcements that everyone can read, comment on and react to.',
  'Upcoming events and public holidays; who is away today.',
  'Sales, goals and project overview charts, visible to everyone.',
  'Favourite tools and "my tasks" at a glance.'
])

heading('More to come')
const more = [
  ['Company Microsoft 365', 'Allows sign-in, important notifications and project tasks or status reports via company email.'],
  ['HR module', 'Company policies and employee performance management.'],
  ['Container planning module', 'Data from Product Information feeding into Cargo Planner for container optimisation.'],
  ['API connections', 'Lets other company software read or send data to the intranet securely, so figures only need to be entered once.'],
  ['AI assistant', 'A chat assistant you can ask questions or tasks, such as leave balance, open inspections or at-risk projects. It only sees what each person is already allowed to see, and asks for confirmation before changing anything.']
]
for (const [name, text] of more) {
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000').text('•  ' + name + ': ', L + 8, doc.y, { width: W - 8, continued: true })
  doc.font('Helvetica').text(text)
  doc.moveDown(0.25)
}

heading('AI assistant: optional extra cost')
table(
  [{ h: 'How much it is used (about 20 people)', w: 275 }, { h: 'Questions a month', w: 110, align: 'right' }, { h: 'AUD per month', w: 110, align: 'right' }],
  [
    ['Light: a few questions each per week', 'about 400', 'about 40'],
    ['Moderate: 2 questions a day each', 'about 900', 'about 90'],
    ['Heavy: 5 questions a day each', 'about 2,200', 'about 230']
  ]
)
para('Estimate at about AUD 0.10 per question, paid only for what is used, and a monthly spending limit can be set. Not included in the running cost above.', { size: 9, color: GREY })

doc.end()
