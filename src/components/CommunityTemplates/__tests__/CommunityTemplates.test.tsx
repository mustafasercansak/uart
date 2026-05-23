import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityTemplates from '../index';
import { LanguageProvider } from '../../../i18n/LanguageProvider';
import communityIndex from '../../../../docs/community-templates/index.json';
import type { FrameProfile, Scenario, SensorTemplate } from '../../../types';

const mocks = vi.hoisted(() => ({
  setProfile: vi.fn(),
  updateLayout: vi.fn(),
  setScenario: vi.fn(),
  navigate: vi.fn(),
  openUrl: vi.fn(),
  saveProfile: vi.fn(),
  saveScenario: vi.fn(),
  getProfile: vi.fn(),
  loadScenarios: vi.fn(),
  profileId: null as string | null,
}));

vi.mock('../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    setProfile: mocks.setProfile,
    updateLayout: mocks.updateLayout,
    setScenario: mocks.setScenario,
    state: { profileId: mocks.profileId },
  }),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: mocks.openUrl,
}));

vi.mock('../../../store/storage', () => ({
  saveProfile: mocks.saveProfile,
  saveScenario: mocks.saveScenario,
  getProfile: mocks.getProfile,
  loadScenarios: mocks.loadScenarios,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
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

const activeProfile: FrameProfile = {
  id: 'profile-1',
  name: 'Bedside Monitor',
  description: 'Clinical monitor profile',
  baudRate: 115200,
  dataBits: 8,
  parity: 'None',
  stopBits: 1,
  sendIntervalMs: 100,
  fields: [],
  framing: { mode: 'fixed' },
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const activeScenario: Scenario = {
  id: 'scenario-1',
  profileId: 'profile-1',
  name: 'Desaturation',
  description: 'Desaturation scenario',
  loop: false,
  steps: [{ id: 'step-1', atMs: 0, target: 'field:SpO2', action: 'set', actionConfig: { value: 88 }, description: 'Low oxygen' }],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const downloadableTemplate: SensorTemplate = {
  id: 'downloadable-template',
  name: 'Downloadable Template',
  description: 'Template file payload',
  icon: 'D',
  category: 'general',
  profile: {
    name: 'Imported Profile',
    description: 'Imported profile',
    baudRate: 9600,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 250,
    framing: { mode: 'fixed' },
    fields: [],
  },
  scenarios: [
    {
      name: 'Imported Scenario',
      description: 'Imported scenario',
      loop: false,
      steps: [{ id: 'template-step-1', atMs: 0, target: 'field:SpO2', action: 'set', actionConfig: { value: 95 }, description: 'Start' }],
    },
  ],
  defaultLayout: { widgets: [{ id: 'w1', type: 'chart', fieldId: 'SpO2', x: 0, y: 0, w: 4, h: 3 }] },
};

const unknownCategoryIndex = {
  ...communityIndex,
  templates: [
    {
      ...communityIndex.templates[0],
      id: 'unknown-category-template',
      name: 'Unknown Category Template',
      category: 'custom_lab',
      file: 'unknown-category.json',
    },
  ],
};

const minimalDownloadableTemplate: SensorTemplate = {
  ...downloadableTemplate,
  scenarios: [],
  defaultLayout: undefined,
};

describe('CommunityTemplates', () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
    vi.clearAllMocks();
    mocks.profileId = null;
    mocks.getProfile.mockReturnValue(activeProfile);
    mocks.loadScenarios.mockReturnValue([activeScenario, { ...activeScenario, id: 'other', profileId: 'other-profile' }]);
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

  it('sorts starred templates first when favorites are loaded from storage', async () => {
    localStorage.setItem('uart_community_favorites', JSON.stringify([communityIndex.templates[1].id]));

    renderCommunityTemplates();

    const first = await screen.findByText(communityIndex.templates[0].name);
    const second = screen.getByText(communityIndex.templates[1].name);
    expect(second.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('recovers from a failed index fetch when Retry is clicked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: vi.fn() })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) });
    vi.stubGlobal('fetch', fetchMock);

    renderCommunityTemplates();

    expect(await screen.findByText('Could not load templates')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Templates shared by the community')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state and disables submit when no active profile is selected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ...communityIndex, templates: [] }),
    }));

    renderCommunityTemplates();

    expect(await screen.findByText('No community templates yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Active Profile' })).toBeDisabled();
  });

  it('opens a GitHub issue draft for the active profile from the toolbar and empty state', async () => {
    mocks.profileId = 'profile-1';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ...communityIndex, templates: [] }),
    }));

    renderCommunityTemplates();
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Active Profile' }));

    expect(mocks.openUrl).toHaveBeenCalledTimes(1);
    expect(mocks.openUrl.mock.calls[0][0]).toContain('Community%20Template%3A%20Bedside%20Monitor');
    expect(mocks.openUrl.mock.calls[0][0]).toContain('Desaturation');
  });

  it('does nothing when submitting without a stored active profile', async () => {
    mocks.profileId = 'missing-profile';
    mocks.getProfile.mockReturnValue(null);

    renderCommunityTemplates();
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Active Profile' }));

    expect(mocks.openUrl).not.toHaveBeenCalled();
  });

  it('imports a community template, applies layout and first scenario, then navigates home', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(downloadableTemplate) }));

    renderCommunityTemplates();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Import' }))[0]);

    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1));
    expect(mocks.saveScenario).toHaveBeenCalledTimes(1);
    expect(mocks.setProfile).toHaveBeenCalledWith(expect.any(String));
    expect(mocks.updateLayout).toHaveBeenCalledWith(downloadableTemplate.defaultLayout?.widgets);
    expect(mocks.setScenario).toHaveBeenCalledWith(expect.any(String));
    expect(await screen.findByText('Applied!')).toBeInTheDocument();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'), { timeout: 1500 });
  });

  it('resets the importing state when a template download fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(communityIndex) })
      .mockResolvedValueOnce({ ok: false, json: vi.fn() }));

    renderCommunityTemplates();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Import' }))[0]);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Import' })[0]).toBeEnabled());
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it('imports a template without layout or scenarios and renders unknown categories', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(unknownCategoryIndex) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(minimalDownloadableTemplate) }));

    renderCommunityTemplates();

    expect(await screen.findByText('Unknown Category Template')).toBeInTheDocument();
    expect(screen.getByText('templateBrowser.categories.custom_lab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1));
    expect(mocks.saveScenario).not.toHaveBeenCalled();
    expect(mocks.updateLayout).not.toHaveBeenCalled();
    expect(mocks.setScenario).not.toHaveBeenCalled();
  });

  it('ignores malformed favorite storage and still renders', async () => {
    localStorage.setItem('uart_community_favorites', '{bad-json');

    renderCommunityTemplates();

    expect(await screen.findByText('Templates shared by the community')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Favorites \(0\)/ })).toBeInTheDocument();
  });
});
