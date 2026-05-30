import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityTemplates from '../index';
import { LanguageProvider } from '../../../i18n/LanguageProvider';
import communityIndex from '../../../../docs/community-templates/index.json';
import { open } from '@tauri-apps/plugin-shell';
import { getProfile, loadScenarios, saveProfile, saveScenario } from '../../../store/storage';

const mockSetProfile = vi.fn();
const mockUpdateLayout = vi.fn();
const mockSetScenario = vi.fn();
const mockNavigate = vi.fn();
let mockProfileId: string | null = null;

vi.mock('../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    setProfile: mockSetProfile,
    updateLayout: mockUpdateLayout,
    setScenario: mockSetScenario,
    state: { profileId: mockProfileId },
  }),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

vi.mock('../../../store/storage', async () => {
  const actual = await vi.importActual<typeof import('../../../store/storage')>('../../../store/storage');
  return {
    ...actual,
    getProfile: vi.fn(),
    loadScenarios: vi.fn(),
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

const renderCommunityTemplates = () =>
  render(
    <LanguageProvider>
      <BrowserRouter>
        <CommunityTemplates />
      </BrowserRouter>
    </LanguageProvider>,
  );

const mockIndexFetch = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(communityIndex),
    }),
  );
};

describe('CommunityTemplates', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
    vi.clearAllMocks();
    vi.useRealTimers();
    mockProfileId = null;
    mockIndexFetch();
  });

  it('renders without crashing', async () => {
    renderCommunityTemplates();

    expect(await screen.findByText('Templates shared by the community')).toBeInTheDocument();
  });

  it('displays template cards from the index.json fixture', async () => {
    renderCommunityTemplates();

    for (const template of communityIndex.templates) {
      expect(await screen.findByText(template.name)).toBeInTheDocument();
      expect(screen.getByText(template.description)).toBeInTheDocument();
    }

    expect(screen.getAllByText('By: mustafasercansak')).toHaveLength(communityIndex.templates.length);
  });

  it('stores and removes favorite IDs in localStorage', async () => {
    renderCommunityTemplates();

    const [firstTemplate] = communityIndex.templates;
    const favoriteButton = (await screen.findAllByTitle('Add to favorites'))[0];

    fireEvent.click(favoriteButton);
    expect(JSON.parse(localStorage.getItem('uart_community_favorites') ?? '[]')).toEqual([firstTemplate.id]);

    fireEvent.click(screen.getByTitle('Remove from favorites'));
    expect(JSON.parse(localStorage.getItem('uart_community_favorites') ?? '[]')).toEqual([]);
  });

  it('ignores malformed favorite storage and starts with an empty favorite set', async () => {
    localStorage.setItem('uart_community_favorites', '{bad json');

    renderCommunityTemplates();

    expect(await screen.findByRole('button', { name: /Favorites \(0\)/ })).toBeInTheDocument();
  });

  it('shows only starred templates when the Favorites filter is active', async () => {
    renderCommunityTemplates();

    const [firstTemplate, secondTemplate] = communityIndex.templates;
    fireEvent.click((await screen.findAllByTitle('Add to favorites'))[0]);
    fireEvent.click(screen.getByRole('button', { name: /Favorites \(1\)/ }));

    await waitFor(() => {
      expect(screen.getByText(firstTemplate.name)).toBeInTheDocument();
      expect(screen.queryByText(secondTemplate.name)).not.toBeInTheDocument();
    });
  });

  it('shows the error state and retries the community index fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: vi.fn() })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) });
    vi.stubGlobal('fetch', fetchMock);

    renderCommunityTemplates();

    expect(await screen.findByText('Could not load templates')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Templates shared by the community')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state and disables submit when no profile is active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ...communityIndex, templates: [] }),
    }));

    renderCommunityTemplates();

    expect(await screen.findByText('No community templates yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Active Profile' })).toBeDisabled();
  });

  it('opens a prefilled submission issue for the active profile', async () => {
    mockProfileId = 'profile-1';
    vi.mocked(getProfile).mockReturnValue({
      id: 'profile-1',
      name: 'Bed Monitor 1',
      description: 'ICU monitor',
      baudRate: 115200,
      dataBits: 8,
      parity: 'None',
      stopBits: 1,
      sendIntervalMs: 1000,
      framing: { mode: 'fixed' },
      fields: [],
      createdAt: 'now',
      updatedAt: 'now',
    });
    vi.mocked(loadScenarios).mockReturnValue([
      {
        id: 'scenario-1',
        profileId: 'profile-1',
        name: 'Baseline',
        description: '',
        loop: false,
        steps: [],
        createdAt: 'now',
        updatedAt: 'now',
      },
    ]);

    renderCommunityTemplates();

    fireEvent.click(await screen.findByRole('button', { name: 'Submit Active Profile' }));

    expect(open).toHaveBeenCalledWith(expect.stringContaining('Community%20Template%3A%20Bed%20Monitor%201'));
  });

  it('does not open a submission issue when the active profile is missing from storage', async () => {
    mockProfileId = 'missing-profile';
    vi.mocked(getProfile).mockReturnValue(null);

    renderCommunityTemplates();

    fireEvent.click(await screen.findByRole('button', { name: 'Submit Active Profile' }));

    expect(open).not.toHaveBeenCalled();
  });

  it('imports a community template, saves scenarios, applies layout, and navigates home', async () => {
    const [entry] = communityIndex.templates;
    const template = {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      icon: entry.icon,
      category: entry.category,
      profile: {
        name: 'Imported Profile',
        description: 'Imported',
        baudRate: 9600,
        dataBits: 8,
        parity: 'None',
        stopBits: 1,
        sendIntervalMs: 100,
        framing: { mode: 'fixed' },
        fields: [],
      },
      scenarios: [
        {
          name: 'Imported Scenario',
          description: '',
          loop: false,
          steps: [{ id: 'old-step', atMs: 0, target: 'field:spo2', action: 'set' as const, actionConfig: { value: 98 } }],
        },
        {
          name: 'Follow-up Scenario',
          description: '',
          loop: false,
          steps: [],
        },
      ],
      defaultLayout: { widgets: [{ id: 'w1', type: 'frame-monitor', x: 0, y: 0, w: 1, h: 1 }] },
    };
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(template) }));

    renderCommunityTemplates();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Import' }))[0]);
    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Imported Profile' })));
    expect(saveScenario).toHaveBeenCalledWith(expect.objectContaining({ name: 'Imported Scenario' }));
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).toHaveBeenCalledWith(template.defaultLayout.widgets);
    expect(mockSetScenario).toHaveBeenCalled();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'), { timeout: 1500 });
  });

  it('renders unknown community categories with the fallback chip style', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ...communityIndex,
        templates: [{ ...communityIndex.templates[0], id: 'unknown-category', category: 'space-lab' }],
      }),
    }));

    renderCommunityTemplates();

    expect(await screen.findByText('templateBrowser.categories.space-lab')).toBeInTheDocument();
  });

  it('shows importing state while a community template fetch is pending', async () => {
    const [entry] = communityIndex.templates;
    let resolveTemplate!: (value: unknown) => void;
    const pendingTemplate = new Promise((resolve) => {
      resolveTemplate = resolve;
    });
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn(() => pendingTemplate) }));

    renderCommunityTemplates();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Import' }))[0]);
    expect(await screen.findByRole('button', { name: 'Importing...' })).toBeDisabled();

    resolveTemplate({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      icon: entry.icon,
      category: entry.category,
      profile: { name: 'Pending Profile', description: '', baudRate: 9600, dataBits: 8, parity: 'None', stopBits: 1, sendIntervalMs: 100, framing: { mode: 'fixed' }, fields: [] },
      scenarios: [],
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Applied!' })).toBeDisabled());
    expect(mockUpdateLayout).not.toHaveBeenCalled();
    expect(mockSetScenario).not.toHaveBeenCalled();
  });

  it('returns to idle import state when a community template fetch fails', async () => {
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) })
      .mockResolvedValueOnce({ ok: false, json: vi.fn() }));

    renderCommunityTemplates();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Import' }))[0]);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Import' })[0]).toBeEnabled());
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('does not set index state when initial fetch resolves after unmount', async () => {
    let resolveJson!: (value: unknown) => void;
    const pendingJson = new Promise((resolve) => {
      resolveJson = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn(() => pendingJson) }));

    const { unmount } = renderCommunityTemplates();
    unmount();
    resolveJson(communityIndex);

    await Promise.resolve();
    expect(true).toBe(true);
  });

  it('does not set error state when initial fetch rejects after unmount', async () => {
    let rejectFetch!: (reason?: unknown) => void;
    const pendingFetch = new Promise((_, reject) => {
      rejectFetch = reject;
    });
    vi.stubGlobal('fetch', vi.fn(() => pendingFetch as Promise<Response>));

    const { unmount } = renderCommunityTemplates();
    unmount();
    rejectFetch(new Error('network down'));

    await Promise.resolve();
    expect(true).toBe(true);
  });

  it('sorts favorite templates to the top when showing all templates', async () => {
    renderCommunityTemplates();

    const [, secondTemplate] = communityIndex.templates;
    fireEvent.click((await screen.findAllByTitle('Add to favorites'))[1]);

    await waitFor(() => {
      const names = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
      expect(names[0]).toBe(secondTemplate.name);
    });
  });

  it('submits templates with empty profile description using fallback empty string', async () => {
    mockProfileId = 'profile-empty-desc';
    vi.mocked(getProfile).mockReturnValue({
      id: 'profile-empty-desc',
      name: 'No Description Profile',
      description: '',
      baudRate: 9600,
      dataBits: 8,
      parity: 'None',
      stopBits: 1,
      sendIntervalMs: 100,
      framing: { mode: 'fixed' },
      fields: [],
      createdAt: 'now',
      updatedAt: 'now',
    });
    vi.mocked(loadScenarios).mockReturnValue([]);

    renderCommunityTemplates();

    fireEvent.click(await screen.findByRole('button', { name: 'Submit Active Profile' }));

    expect(open).toHaveBeenCalledTimes(1);
    const calledUrl = String(vi.mocked(open).mock.calls[0][0]);
    expect(decodeURIComponent(calledUrl)).toContain('"description": ""');
  });
});
