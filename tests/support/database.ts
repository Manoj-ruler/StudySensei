import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))

/** Migration file names in the order they are applied. */
export const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

/**
 * What the Supabase platform provides and the migrations rely on: the three
 * roles, auth.users, auth.uid(), and the storage tables. These are simplified
 * stand-ins, enough to exercise the schema, policies and functions.
 */
const PLATFORM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    raw_user_meta_data jsonb default '{}'
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

export interface TestDatabase {
    /** Runs one or more statements as the database owner. */
    exec(sql: string): Promise<void>
    rows<T = Record<string, unknown>>(sql: string): Promise<T[]>
    one<T = Record<string, unknown>>(sql: string): Promise<T>
    /** Applies migrations whose file name sorts after everything applied so far, up to and including `through`. */
    migrate(through?: string): Promise<void>
    /** Runs `fn` as a signed-in user, with row level security in force. */
    as<T>(userId: string, fn: () => Promise<T>): Promise<T>
    /** Runs `fn` as a signed-out visitor. */
    asAnon<T>(fn: () => Promise<T>): Promise<T>
    /** Runs `fn` as the server's service role (bypasses row level security). */
    asService<T>(fn: () => Promise<T>): Promise<T>
    close(): Promise<void>
}

/**
 * Starts an embedded Postgres with pgvector and the platform stand-ins.
 * Pass `through` to stop before later migrations, e.g. to seed data in the
 * shape it had before a migration and then apply it.
 */
export async function createTestDatabase(options: { through?: string } = {}): Promise<TestDatabase> {
    const pg = new PGlite({ extensions: { vector } })
    await pg.exec(PLATFORM)

    let applied = 0
    const migrate = async (through?: string) => {
        const last = through ? MIGRATIONS.findIndex((name) => name.startsWith(through)) : MIGRATIONS.length - 1
        if (last < 0) throw new Error(`No migration starts with "${through}"`)
        for (; applied <= last; applied++) {
            await pg.exec(readFileSync(MIGRATIONS_DIR + MIGRATIONS[applied], 'utf8'))
        }
    }
    await migrate(options.through)

    const withRole = async <T>(role: string, userId: string, fn: () => Promise<T>): Promise<T> => {
        await pg.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId}', false);`)
        try {
            return await fn()
        } finally {
            await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
        }
    }

    const rows = async <T>(sql: string) => (await pg.query<T>(sql)).rows

    return {
        exec: async (sql) => {
            await pg.exec(sql)
        },
        rows,
        one: async <T>(sql: string) => (await rows<T>(sql))[0],
        migrate,
        as: (userId, fn) => withRole('authenticated', userId, fn),
        asAnon: (fn) => withRole('anon', '', fn),
        asService: (fn) => withRole('service_role', '', fn),
        close: () => pg.close(),
    }
}

/** The error message if `fn` throws, otherwise null. */
export async function failure(fn: () => Promise<unknown>): Promise<string | null> {
    try {
        await fn()
        return null
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

export const USER_A = '11111111-1111-1111-1111-111111111111'
export const USER_B = '22222222-2222-2222-2222-222222222222'
export const SKILL_A = 'a0000000-0000-0000-0000-000000000001'
export const SKILL_B = 'b0000000-0000-0000-0000-000000000001'

/** A 768-dimension vector in pgvector's text form, varying only in its first component. */
export function embedding(first: number): string {
    return `[${[first, ...Array(767).fill(0.01)].join(',')}]`
}
