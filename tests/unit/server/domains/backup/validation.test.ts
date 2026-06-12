import { describe, expect, it } from 'vitest'

import { validateBackupSql } from '@/server/domains/backup/services/validate'
import { ActionFailure } from '@/server/infra/http/errors'

describe('backup validation', () => {
  it('accepts a normal pg_dump with CREATE TABLE and INSERT', () => {
    const sql = `-- PostgreSQL database dump\nCREATE TABLE users (id serial PRIMARY KEY);\nINSERT INTO users (id) VALUES (1);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('rejects SQL without pg_dump header, CREATE TABLE, or INSERT', () => {
    const sql = `SELECT * FROM users;`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects DROP DATABASE', () => {
    const sql = `-- PostgreSQL database dump\nDROP DATABASE IF EXISTS kobato;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
    try {
      validateBackupSql(sql)
    } catch (e) {
      expect((e as ActionFailure).message).toContain('危险 SQL')
    }
  })

  it('accepts DROP SCHEMA from pg_dump --clean', () => {
    const sql = `-- PostgreSQL database dump\nDROP SCHEMA IF EXISTS drizzle;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('rejects psql shell escape \\!', () => {
    const sql = `-- PostgreSQL database dump\n\\! rm -rf /\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects psql \\include', () => {
    const sql = `-- PostgreSQL database dump\n\\include /etc/passwd\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects psql \\i', () => {
    const sql = `-- PostgreSQL database dump\n\\i /etc/passwd\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects ALTER SYSTEM', () => {
    const sql = `-- PostgreSQL database dump\nALTER SYSTEM SET password_encryption = 'md5';\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects oversized SQL (>500MB)', () => {
    const sql = 'x'.repeat(500 * 1024 * 1024 + 1)
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
    try {
      validateBackupSql(sql)
    } catch (e) {
      expect((e as ActionFailure).message).toContain('过大')
    }
  })

  it('is case-insensitive for blocked patterns', () => {
    const sql = `-- PostgreSQL database dump\ndrop database kobato;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects CREATE FUNCTION', () => {
    const sql = `-- PostgreSQL database dump\nCREATE FUNCTION evil() RETURNS void AS $$ BEGIN PERFORM pg_read_file('/etc/passwd'); END; $$ LANGUAGE plpgsql;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects CREATE PROCEDURE', () => {
    const sql = `-- PostgreSQL database dump\nCREATE PROCEDURE evil() AS $$ BEGIN PERFORM pg_read_file('/etc/passwd'); END; $$ LANGUAGE plpgsql;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects CREATE EXTENSION for blocked extensions', () => {
    const sql = `-- PostgreSQL database dump\nCREATE EXTENSION IF NOT EXISTS file_fdw;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('accepts CREATE EXTENSION for allowed extensions', () => {
    const sql = `-- PostgreSQL database dump\nCREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS timescaledb WITH SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS timescaledb_toolkit WITH SCHEMA public;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('rejects LANGUAGE plpython3u', () => {
    const sql = `-- PostgreSQL database dump\nCREATE FUNCTION evil() RETURNS void AS $$ import os $$ LANGUAGE plpython3u;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects LANGUAGE plperlu', () => {
    const sql = `-- PostgreSQL database dump\nCREATE FUNCTION evil() RETURNS void AS $$ system("id") $$ LANGUAGE plperlu;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects disallowed statement prefixes like VACUUM', () => {
    const sql = `-- PostgreSQL database dump\nVACUUM ANALYZE users;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects disallowed statement prefixes like NOTIFY', () => {
    const sql = `-- PostgreSQL database dump\nNOTIFY channel, 'payload';\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('accepts multi-line CREATE TABLE from pg_dump', () => {
    const sql = `-- PostgreSQL database dump
CREATE TABLE public.users (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL
);
INSERT INTO users (id) VALUES (1);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('accepts multi-line CREATE TYPE with ENUM values', () => {
    const sql = `-- PostgreSQL database dump
CREATE TYPE public.user_role AS ENUM (
    'admin',
    'author',
    'visitor'
);
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('accepts COPY data blocks with \\. terminator', () => {
    const sql = `-- PostgreSQL database dump
COPY public.users (id, name) FROM stdin;
1	Alice
2	Bob
\\.
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('accepts END as COMMIT synonym', () => {
    const sql = `-- PostgreSQL database dump
BEGIN;
INSERT INTO users (id) VALUES (1);
END;
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('accepts pg_dump \\restrict / \\unrestrict security wrappers', () => {
    const sql = `-- PostgreSQL database dump
\\restrict abc123
SET statement_timeout = 0;
CREATE TABLE users (id serial PRIMARY KEY);
\\unrestrict abc123`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('rejects COPY FROM a file path', () => {
    const sql = `-- PostgreSQL database dump
COPY users (email) FROM '/etc/passwd';
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects SET ROLE', () => {
    const sql = `-- PostgreSQL database dump
SET ROLE postgres;
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects SET SESSION AUTHORIZATION', () => {
    const sql = `-- PostgreSQL database dump
SET SESSION AUTHORIZATION 'postgres';
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects GRANT ALL PRIVILEGES at database level', () => {
    const sql = `-- PostgreSQL database dump
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects CREATE EXTENSION for dangerous extension plpython3u', () => {
    const sql = `-- PostgreSQL database dump
CREATE EXTENSION IF NOT EXISTS plpython3u;
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('rejects comment-obfuscated SET ROLE', () => {
    const sql = `-- PostgreSQL database dump
SET /* foo */ ROLE postgres;
CREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
  })

  it('accepts representative pg_dump output', () => {
    const sql = `-- PostgreSQL database dump
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying(255) NOT NULL
);
COPY public.users (id, email) FROM stdin;
1	alice@example.com
2	bob@example.com
\\.
INSERT INTO public.users (id, email) VALUES (3, 'charlie@example.com');`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })
})
