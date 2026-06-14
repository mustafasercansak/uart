import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import TemplateBrowser from '../index';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from '../../../i18n/LanguageProvider';

// Mock the hooks
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
  })
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('TemplateBrowser Component', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'tr');
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should render template cards correctly', () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );
    
    expect(screen.getByText('Şablon Kütüphanesi')).toBeInTheDocument();
    expect(screen.getByText('Açık Kaynak Ventilatör')).toBeInTheDocument();
  });

  it('should call simulation actions and navigate when template is applied', async () => {
    vi.useFakeTimers();
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );
    
    // Second template (YS2000A Patient Monitor) has both defaultLayout and scenarios
    const applyButtons = screen.getAllByText(/Bu Şablonu Kullan/i);
    fireEvent.click(applyButtons[1]);

    // applyTemplate yields once to render the applying state
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    // Verify simulation calls
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).toHaveBeenCalled();
    expect(mockSetScenario).toHaveBeenCalled();
    expect(screen.getByText('Simülasyona Uygulandı')).toBeInTheDocument();

    // Advance timers for navigation
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
    
    vi.useRealTimers();
  });

  it('should filter templates by category', () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );

    // Click "Tıbbi" filter button
    const medicalFilter = screen.getByRole('button', { name: 'Tıbbi' });
    fireEvent.click(medicalFilter);

    // Verify a medical template is still there
    expect(screen.getByText('SpO2 Modülü')).toBeInTheDocument();
    
    // Switch to 'All'
    const allFilter = screen.getByText(/Tümü/i);
    fireEvent.click(allFilter);
    expect(screen.getByText('Açık Kaynak Ventilatör')).toBeInTheDocument();
  });

  it('should navigate to profiles when arrow button is clicked', () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );

    const profileButtons = screen.getAllByTitle('Profillere git');
    fireEvent.click(profileButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/profiles');
  });

  it('should switch to the community templates tab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ format: 'uart-community-templates', version: '1', updatedAt: 'now', templates: [] }),
    }));

    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Topluluk' }));

    expect(await screen.findByText('Henüz topluluk şablonu yok')).toBeInTheDocument();
  });
});
