import { render, screen, fireEvent, within } from '@testing-library/react';
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
    setScenario: mockSetScenario
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
    vi.clearAllMocks();
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
    
    // Find the 'Bu Şablonu Kullan' button for the Ventilator
    const applyButtons = screen.getAllByText(/Bu Şablonu Kullan/i);
    fireEvent.click(applyButtons[applyButtons.length - 1]); // Last one is the Ventilator we added

    // Verify simulation calls
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).toHaveBeenCalled();
    expect(mockSetScenario).toHaveBeenCalled();

    // Advance timers for navigation
    vi.advanceTimersByTime(1000);
    expect(mockNavigate).toHaveBeenCalledWith('/');
    
    vi.useRealTimers();
  });

  it('should apply a template without scenarios or default layout', () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );

    const nibpCard = screen.getByText('NIBP Modülü').closest('div[class*="bg-gray-800"]');
    expect(nibpCard).toBeTruthy();

    fireEvent.click(within(nibpCard as HTMLElement).getByRole('button', { name: /Bu Şablonu Kullan/i }));

    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).not.toHaveBeenCalled();
    expect(mockSetScenario).not.toHaveBeenCalled();
  });

  it('should apply every scenario from a multi-scenario template', () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );

    const monitorCard = screen.getByText('YS2000A Patient Monitor').closest('div[class*="bg-gray-800"]');
    expect(monitorCard).toBeTruthy();

    fireEvent.click(within(monitorCard as HTMLElement).getByRole('button', { name: /Bu Şablonu Kullan/i }));

    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).toHaveBeenCalled();
    expect(mockSetScenario).toHaveBeenCalledTimes(1);
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

  it('should render community templates tab', () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <TemplateBrowser />
        </BrowserRouter>
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /topluluk/i }));

    expect(screen.queryByText('Açık Kaynak Ventilatör')).not.toBeInTheDocument();
    expect(screen.getByText('Şablonlar yükleniyor...')).toBeInTheDocument();
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
});
