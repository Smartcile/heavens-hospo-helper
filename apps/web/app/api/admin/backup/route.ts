import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exec } from 'child_process'
import { writeFile, readFile, unlink, readdir, stat, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path, { join } from 'path'

async function runCommand(cmd: string, timeout = 60_000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0 })
    })
  })
}

async function readUploads(): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const uploadsDir = join(process.cwd(), 'public', 'uploads')
  try {
    const entries = await readdir(uploadsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = join(uploadsDir, entry.name)
        const content = await readFile(filePath)
        files[entry.name] = content.toString('base64')
      }
    }
  } catch { /* uploads dir might not exist */ }
  return files
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 })
  }

  const includeUploads = req.nextUrl.searchParams.get('uploads') === '1'

  try {
    // When uploads requested, skip pg_dump — JSON path includes file data
    if (!includeUploads) {
    // Try native pg_dump first (fast, handles all data types)
    const dumpFile = path.join(process.cwd(), '..', `${randomUUID()}.sql`)
    const escaped = dbUrl.replace(/"/g, '\\"')
    const { code: dumpCode, stderr } = await runCommand(`pg_dump --dbname="${escaped}" --no-owner --no-acl --format=plain > "${dumpFile}"`, 120_000)

    if (dumpCode === 0) {
      const stat = await import('fs/promises').then((m) => m.stat(dumpFile))
      if (stat.size === 0) throw new Error('Empty dump')
      const sql = await readFile(dumpFile, 'utf-8')
      await unlink(dumpFile).catch(() => {})
      return new NextResponse(sql, {
        status: 200,
        headers: {
          'Content-Type': 'application/sql',
          'Content-Disposition': `attachment; filename="hospo-ops-backup-${new Date().toISOString().slice(0, 10)}.sql"`,
          'Cache-Control': 'no-cache',
        },
      })
    }
    }

    // Fallback: JSON-based backup via Prisma (works without pg_dump)
    const { prisma } = await import('@hospo-ops/db')

    // When uploads requested, try tar.gz for transportable backup
    if (includeUploads) {
      const tmpDir = path.join(process.cwd(), '..', `backup-${randomUUID()}`)
      await mkdir(tmpDir, { recursive: true })
      try {
        // Write SQL dump
        const sqlFile = path.join(tmpDir, 'database.sql')
        try {
          const escaped = dbUrl.replace(/"/g, '\\"')
          await runCommand(`pg_dump --dbname="${escaped}" --no-owner --no-acl --format=plain > "${sqlFile}"`, 120_000)
        } catch {
          // Fallback: generate SQL from Prisma data
          const allTables2 = (await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`)) as { tablename: string }[]
          const data: Record<string, unknown[]> = {}
          for (const { tablename } of allTables2) {
            if (tablename === '_prisma_migrations' || tablename.startsWith('pg_')) continue
            try { const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}"`); if (Array.isArray(rows)) data[tablename] = rows } catch {}
          }
          await writeFile(sqlFile, JSON.stringify({ version: 1, data }, null, 2))
        }

        // Copy uploads
        const uploadsDir = join(process.cwd(), 'public', 'uploads')
        const uploadsDest = path.join(tmpDir, 'uploads')
        try {
          await mkdir(uploadsDest, { recursive: true })
          const entries = await readdir(uploadsDir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isFile()) {
              const src = join(uploadsDir, entry.name)
              const dst = path.join(uploadsDest, entry.name)
              await import('fs/promises').then((m) => m.cp(src, dst))
            }
          }
        } catch {}

        // Create tar.gz
        const archiveFile = `${tmpDir}.tar.gz`
        const { code } = await runCommand(`tar -czf "${archiveFile}" -C "${tmpDir}" .`, 120_000)

        if (code === 0) {
          const archive = await readFile(archiveFile)
          await import('fs/promises').then((m) => Promise.all([m.rm(tmpDir, { recursive: true }), m.unlink(archiveFile)]))
          return new NextResponse(archive, {
            status: 200,
            headers: {
              'Content-Type': 'application/gzip',
              'Content-Disposition': `attachment; filename="hospo-ops-backup-${new Date().toISOString().slice(0, 10)}-with-files.tar.gz"`,
              'Cache-Control': 'no-cache',
            },
          })
        }
        await import('fs/promises').then((m) => m.rm(tmpDir, { recursive: true }).catch(() => {}))
      } catch { await import('fs/promises').then((m) => m.rm(tmpDir, { recursive: true }).catch(() => {})) }
    }
    const allTables = (await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
    )) as { tablename: string }[]

    const data: Record<string, unknown[]> = {}
    for (const { tablename } of allTables) {
      if (tablename === '_prisma_migrations' || tablename.startsWith('pg_')) continue
      try {
        const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}"`)
        if (Array.isArray(rows) && rows.length > 0) data[tablename] = rows
      } catch { /* table might not support raw query */ }
    }

    const uploads = includeUploads ? await readUploads() : null
    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
      ...(uploads ? { uploads } : {}),
    }, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="hospo-ops-backup-${new Date().toISOString().slice(0, 10)}${uploads ? '-with-files' : ''}.json"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: `Backup failed: ${err.message}` }, { status: 500 })
  }
}
