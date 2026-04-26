import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/bug-report-client', () => ({
  submitBugReport: jest.fn(async () => ({ kind: 'ok' })),
}));

jest.mock('../../contexts/BugReportContext', () => ({
  useBugReport: () => ({
    visible: true,
    triggerSource: 'settings',
    screenshotBase64: 'fake-b64',
    openBugReport: jest.fn(),
    closeBugReport: jest.fn(),
  }),
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useSegments: jest.fn(() => []),
  useRootNavigationState: jest.fn(() => null),
  Stack: { Screen: jest.fn() },
  usePathname: () => '/feed',
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.2.0', extra: { supabaseUrl: 'x', supabaseAnonKey: 'x' } },
  deviceName: 'iPhone 15',
}));

import { BugReportModal } from '../../components/BugReportModal';

describe('BugReportModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disables submit when title empty', () => {
    const { getByPlaceholderText, getByRole } = render(<BugReportModal />);
    fireEvent.changeText(getByPlaceholderText(/what went wrong/i), 'desc');
    expect(getByRole('button', { name: /submit a ticket/i }).props.accessibilityState?.disabled).toBe(true);
  });

  it('disables submit when description empty', () => {
    const { getByPlaceholderText, getByRole } = render(<BugReportModal />);
    fireEvent.changeText(getByPlaceholderText(/brief summary/i), 'title');
    expect(getByRole('button', { name: /submit a ticket/i }).props.accessibilityState?.disabled).toBe(true);
  });

  it('enables submit when both fields filled', () => {
    const { getByPlaceholderText, getByRole } = render(<BugReportModal />);
    fireEvent.changeText(getByPlaceholderText(/brief summary/i), 'title');
    fireEvent.changeText(getByPlaceholderText(/what went wrong/i), 'desc');
    expect(getByRole('button', { name: /submit a ticket/i }).props.accessibilityState?.disabled).toBe(false);
  });

  it('calls submitBugReport on submit with correct payload', async () => {
    const { submitBugReport } = require('../../lib/bug-report-client');
    const { getByPlaceholderText, getByRole } = render(<BugReportModal />);
    fireEvent.changeText(getByPlaceholderText(/brief summary/i), 't');
    fireEvent.changeText(getByPlaceholderText(/what went wrong/i), 'd');
    fireEvent.press(getByRole('button', { name: /submit a ticket/i }));
    await waitFor(() => expect(submitBugReport).toHaveBeenCalledTimes(1));
    const args = submitBugReport.mock.calls[0][0];
    expect(args.title).toBe('t');
    expect(args.description).toBe('d');
    expect(args.screenshot_base64).toBe('fake-b64');
    expect(args.route).toBe('/feed');
    expect(args.app_version).toBe('1.2.0');
  });

  it('shows rate-limit error inline', async () => {
    const { submitBugReport } = require('../../lib/bug-report-client');
    submitBugReport.mockResolvedValueOnce({ kind: 'rate_limited' });
    const { getByPlaceholderText, getByRole, findByText } = render(<BugReportModal />);
    fireEvent.changeText(getByPlaceholderText(/brief summary/i), 't');
    fireEvent.changeText(getByPlaceholderText(/what went wrong/i), 'd');
    fireEvent.press(getByRole('button', { name: /submit a ticket/i }));
    await findByText(/submitted a lot of reports/i);
  });
});
