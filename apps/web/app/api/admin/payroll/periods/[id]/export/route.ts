import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.export')
  if (denied) return denied

  const format = req.nextUrl.searchParams.get('format') ?? 'csv'

  const period = await prisma.payPeriod.findUnique({ where: { id: params.id } })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: params.id, deletedAt: null },
    include: { staff: { select: { firstName: true, lastName: true, employmentType: true } } },
    orderBy: { totalPay: 'desc' },
  })

  if (format === 'csv') {
    const header = 'Name,Employment Type,Ordinary Hours,Overtime Hours,Public Holiday Hours,Total Hours,Rate,Gross Pay,Holiday Pay,PAYE,ACC,KiwiSaver Employee,KiwiSaver Employer,Student Loan,Net Pay,Employer Cost,Alt Days Owed'
    const rows = entries.map((e) =>
      [
        `"${e.staff.firstName} ${e.staff.lastName}"`,
        e.staff.employmentType ?? '',
        (e.ordinaryHours ?? 0).toFixed(2),
        (e.overtimeHours ?? 0).toFixed(2),
        (e.publicHolidayHours ?? 0).toFixed(2),
        e.totalHours.toFixed(2),
        e.hourlyRate.toFixed(2),
        (e.grossPay ?? e.totalPay).toFixed(2),
        (e.holidayPay ?? 0).toFixed(2),
        (e.paye ?? 0).toFixed(2),
        (e.accLevy ?? 0).toFixed(2),
        (e.kiwiSaverEmployee ?? 0).toFixed(2),
        (e.kiwiSaverEmployer ?? 0).toFixed(2),
        (e.studentLoan ?? 0).toFixed(2),
        (e.netPay ?? 0).toFixed(2),
        (e.employerCost ?? 0).toFixed(2),
        e.alternativeDaysOwed ?? 0,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="payroll-${period.startDate.toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  const grandTotal = entries.reduce((s, e) => s + e.totalPay, 0)
  const totalHours = entries.reduce((s, e) => s + e.totalHours, 0)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Payroll — ${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)}</title>
<style>
  body { background: #0A0A0A; color: #F5F5F5; font-family: 'Courier New', monospace; padding: 2rem; }
  h1 { font-size: 1.25rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; }
  .meta { font-size: 0.75rem; color: #6B6B6B; margin-bottom: 2rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  th { text-align: left; color: #6B6B6B; text-transform: uppercase; border-bottom: 1px solid #2E2E2E; padding: 0.5rem 0.75rem; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #2E2E2E; }
  .right { text-align: right; }
  .total { font-weight: 700; border-top: 2px solid #FACC15; }
</style>
</head>
<body>
<h1>PAYROLL REPORT</h1>
<p class="meta">${period.startDate.toISOString().slice(0, 10)} — ${period.endDate.toISOString().slice(0, 10)} &middot; ${entries.length} STAFF &middot; ${formatDateKey(new Date())}</p>
<table>
<thead><tr><th>NAME</th><th>TYPE</th><th class="right">HOURS</th><th class="right">RATE</th><th class="right">TOTAL</th></tr></thead>
<tbody>
${entries.map((e) => `
<tr>
  <td>${e.staff.firstName} ${e.staff.lastName}</td>
  <td>${e.staff.employmentType ?? '—'}</td>
  <td class="right">${e.totalHours.toFixed(2)}</td>
  <td class="right">$${e.hourlyRate.toFixed(2)}</td>
  <td class="right">$${e.totalPay.toFixed(2)}</td>
</tr>`).join('')}
<tr class="total">
  <td colspan="2">TOTAL</td>
  <td class="right">${totalHours.toFixed(2)}</td>
  <td></td>
  <td class="right">$${grandTotal.toFixed(2)}</td>
</tr>
</tbody>
</table>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
