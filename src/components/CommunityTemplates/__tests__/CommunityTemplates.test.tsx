import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityTemplates from '../index';
import { LanguageProvider } from '../../../i18n/LanguageProvider';
import communityIndex from '../../../../docs/community-templates/index.json';

const mockSetProfile = vi.fn();
const mockUpdateLayout = vi.fn();
const mockSetScenario = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    setProfile: mockSetProfile,
    updateLayout: mockUpdateLayout,
    setScenario: mockSetScenario,
    state: { profileId: null },
  }),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

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
});
