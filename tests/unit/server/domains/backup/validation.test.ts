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

  it('rejects CREATE EXTENSION', () => {
    const sql = `-- PostgreSQL database dump\nCREATE EXTENSION IF NOT EXISTS file_fdw;\nCREATE TABLE users (id serial PRIMARY KEY);`
    expect(() => validateBackupSql(sql)).toThrow(ActionFailure)
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
})
