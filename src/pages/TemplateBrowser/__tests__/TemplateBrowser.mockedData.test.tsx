import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageProvider';
import TemplateBrowser from '../index';
import { saveProfile, saveScenario } from '../../../store/storage';

const mockSetProfile = vi.fn();
const mockUpdateLayout = vi.fn();
const mockSetScenario = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../../data/templates', () => ({
  SENSOR_TEMPLATES: [
    {
      id: 'minimal-template',
      name: 'Minimal Template',
      description: 'No scenarios or layout',
      icon: 'M',
      category: 'unknown_category',
      profile: {
        name: 'Minimal Profile',
        description: '',
        baudRate: 9600,
        dataBits: 8,
        parity: 'None',
        stopBits: 1,
        sendIntervalMs: 100,
        framing: { mode: 'fixed' },
        fields: [
          { id: 'fixed', name: 'FIXED', byteWidth: 1, order: 0, type: 'fixed' },
          { id: 'range', name: 'RANGE', byteWidth: 1, order: 1, type: 'range' },
          { id: 'wave', name: 'WAVE', byteWidth: 1, order: 2, type: 'waveform' },
          { id: 'checksum', name: 'CHECKSUM', byteWidth: 1, order: 3, type: 'checksum' },
          { id: 'flags', name: 'FLAGS', byteWidth: 1, order: 4, type: 'flags' },
          { id: 'custom', name: 'CUSTOM', byteWidth: 1, order: 5, type: 'custom' },
        ],
      },
      scenarios: [],
    },
    {
      id: 'scenario-template',
      name: 'Scenario Template',
      description: 'Has scenarios and default layout',
      icon: 'S',
      category: 'medical',
      profile: {
        name: 'Scenario Profile',
        description: '',
        baudRate: 57600,
        dataBits: 8,
        parity: 'None',
        stopBits: 1,
        sendIntervalMs: 50,
        framing: { mode: 'fixed' },
        fields: [
          { id: 'fixed2', name: 'FIXED2', byteWidth: 1, order: 0, type: 'fixed' },
        ],
      },
      defaultLayout: { widgets: [{ id: 'w1', kind: 'terminal', x: 0, y: 0, w: 4, h: 3 }] },
      scenarios: [
        {
          name: 'Boot Sequence',
          description: 'startup',
          loop: false,
          steps: [
            { type: 'wait', ms: 100 },
          ],
        },
      ],
    },
  ],
}));

vi.mock('../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    setProfile: mockSetProfile,
    updateLayout: mockUpdateLayout,
    setScenario: mockSetScenario,
    state: { profileId: null },
  }),
}));

vi.mock('../../../store/storage', async () => {
  const actual = await vi.importActual<typeof import('../../../store/storage')>('../../../store/storage');
  return {
    ...actual,
    saveProfile: vi.fn(),
    saveScenario: vi.fn(),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderBrowser = () =>
  render(
    <LanguageProvider>
      <BrowserRouter>
        <TemplateBrowser />
      </BrowserRouter>
    </LanguageProvider>,
  );

describe('TemplateBrowser with minimal templates', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('applies a template without scenarios or default layout', async () => {
    renderBrowser();

    expect(screen.getAllByText('templateBrowser.categories.unknown_category')).toHaveLength(2);
    const minimalHeading = screen.getByText('Minimal Template');
    const minimalCard = minimalHeading.closest('div.bg-gray-800');
    expect(minimalCard).toBeTruthy();
    fireEvent.click(within(minimalCard as HTMLElement).getByRole('button', { name: 'Use This Template' }));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Minimal Profile' }));
    expect(saveScenario).not.toHaveBeenCalled();
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).not.toHaveBeenCalled();
    expect(mockSetScenario).not.toHaveBeenCalled();
    expect(screen.getByText('Applied to Simulation')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('applies a template with scenarios and default layout', async () => {
    renderBrowser();

    expect(screen.getByText('1 scenarios')).toBeInTheDocument();

    const scenarioHeading = screen.getByText('Scenario Template');
    const scenarioCard = scenarioHeading.closest('div.bg-gray-800');
    expect(scenarioCard).toBeTruthy();

    const applyBtn = within(scenarioCard as HTMLElement).getByRole('button', { name: 'Use This Template' });
    fireEvent.click(applyBtn);
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Scenario Profile' }));
    expect(saveScenario).toHaveBeenCalledTimes(1);
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).toHaveBeenCalled();
    expect(mockSetScenario).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows applying label while template apply is in progress', async () => {
    renderBrowser();

    const minimalHeading = screen.getByText('Minimal Template');
    const minimalCard = minimalHeading.closest('div.bg-gray-800');
    expect(minimalCard).toBeTruthy();

    fireEvent.click(within(minimalCard as HTMLElement).getByRole('button', { name: 'Use This Template' }));
    expect(screen.getByText('Applying...')).toBeInTheDocument();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });
});
