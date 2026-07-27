import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  matchesAdminContentSearch,
  normalizeAdminSearch,
} from '../lib/admin-content-search';

const adminPage = readFileSync('app/admin/page.tsx', 'utf8');
const adminConsole = readFileSync('app/admin/admin-console.tsx', 'utf8');

describe('admin unified content search', () => {
  it('normalizes accents and matches every query token across different fields', () => {
    expect(normalizeAdminSearch('  José — ECON_User  ')).toBe(
      'jose econ user',
    );
    expect(
      matchesAdminContentSearch(
        'ansh broken pdf',
        { full_name: 'Ansh Gupta', username: 'agfh5300' },
        { message: 'The PDF preview is broken on mobile.' },
      ),
    ).toBe(true);
    expect(
      matchesAdminContentSearch('revision village', {
        subject: 'Question bank issue',
        message: 'Save My Exams resource',
      }),
    ).toBe(false);
  });

  it('uses one broad search field in reports, tickets, and users', () => {
    expect(adminConsole).toContain('Search reports');
    expect(adminConsole).toContain('Search tickets');
    expect(adminConsole).toContain('Search users');
    expect(adminConsole).toContain('Name, username, email, resource, message, notes…');
    expect(adminConsole).toContain('Name, username, email, subject, message, replies…');
    expect(adminConsole).toContain('Full name, username, email, role, status…');
  });

  it('searches queue text, reporter/admin identities, and support replies before pagination', () => {
    expect(adminPage).toContain('matchesAdminContentSearch(');
    expect(adminPage).toContain('loadIdentityMap');
    expect(adminPage).toContain('loadTicketMessageMap');
    expect(adminPage).toContain(".from('dp_support_ticket_messages')");
    expect(adminPage).toContain("row.assigned_to ? '' : 'unassigned'");
    expect(adminPage).toContain('const data = filtered.slice(start, start + pageSize)');
  });

  it('loads and enriches all matching users before applying user pagination', () => {
    expect(adminPage).toContain('sp.userSearch || sp.userEmail');
    expect(adminPage).toContain('user.full_name');
    expect(adminPage).toContain('user.username');
    expect(adminPage).toContain('user.email');
    expect(adminPage).toContain('suspended inactive blocked');
    expect(adminPage).toContain('memberships = filtered.slice(start, start + userSize)');
  });
});
