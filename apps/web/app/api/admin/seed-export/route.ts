import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const demoVenueId = '00000000-0000-0000-00d0-000000000001'

  const [venue, departments, tasks, checklists, training, staff, sections] = await Promise.all([
    prisma.venue.findUnique({ where: { id: demoVenueId } }),
    prisma.department.findMany({ where: { venueId: demoVenueId, deletedAt: null } }),
    prisma.task.findMany({ where: { venueId: demoVenueId, deletedAt: null } }),
    prisma.checklist.findMany({ where: { venueId: demoVenueId, deletedAt: null }, include: { tasks: { select: { taskId: true } } } }),
    prisma.trainingModule.findMany({
      where: { venueId: demoVenueId, deletedAt: null },
      include: { steps: { orderBy: { order: 'asc' } } },
    }),
    prisma.staff.findMany({
      where: { venueId: demoVenueId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, pin: true, departmentId: true, hourlyRate: true, employmentType: true, isActive: true },
    }),
    prisma.section.findMany({ where: { venueId: demoVenueId, deletedAt: null } }),
  ])

  if (!venue) return NextResponse.json({ error: 'Demo venue not found' }, { status: 404 })

  // Strip sensitive data
  const exportData = {
    venue: {
      name: venue.name,
      timezone: venue.timezone,
    },
    departments: departments.map((d) => ({ id: d.id, name: d.name, colour: d.colour, isActive: d.isActive })),
    sections: sections.map((s) => ({ id: s.id, name: s.name, colour: s.colour, departmentId: s.departmentId, sortOrder: s.sortOrder, isActive: s.isActive })),
    staff: staff.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      role: s.role,
      pin: s.pin ? 'BCRYPT_HASH_PLACEHOLDER' : null,
      password: s.email ? 'BCRYPT_HASH_PLACEHOLDER' : null,
      departmentId: s.departmentId,
      hourlyRate: s.hourlyRate,
      employmentType: s.employmentType,
      isActive: s.isActive,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      departmentId: t.departmentId,
      sectionId: t.sectionId,
      completionType: t.completionType,
      scheduleType: t.scheduleType,
      scheduleDays: t.scheduleDays,
      monthlyOption: t.monthlyOption,
      monthlyDay: t.monthlyDay,
      intervalMonths: t.intervalMonths,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    })),
    checklists: checklists.map((c) => ({
      id: c.id,
      name: c.name,
      departmentId: c.departmentId,
      sectionId: c.sectionId,
      appearFromTime: c.appearFromTime,
      tasks: c.tasks.map((t) => t.taskId),
    })),
    training: training.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      departmentId: m.departmentId,
      linkedTaskId: m.linkedTaskId,
      kind: m.kind,
      requiresSignOff: m.requiresSignOff,
      isOnboarding: m.isOnboarding,
      steps: m.steps.map((s) => ({ title: s.title, content: s.content, imageUrl: s.imageUrl, videoUrl: s.videoUrl })),
    })),
  }

  return NextResponse.json(exportData, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="demo-seed-export.json"',
    },
  })
}
